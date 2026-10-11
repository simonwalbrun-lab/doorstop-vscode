import * as path from 'node:path';
import * as vscode from 'vscode';

import { AddedItem, choosePrefix } from './doorstopCommands';
import { DoorstopServer } from './doorstopServer';
import { withDelayedProgress } from './progress';
import { measure, registerCommand } from './timing';
import { DocumentNode, TreeResponse } from './doorstopTypes';
import {
  ChangeSet,
  DEBOUNCE_MS,
  ItemUpdate,
  DOCUMENT_VIEW_SCHEME,
  ParsedBlock,
  RenderedBlock,
  StructuralIssue,
  ViewScope,
  documentScope,
  filterScope,
  insertionPointAfterBlock,
  isViewUri,
  normaliseFieldList,
  parse,
  placeholderBlockText,
  planSave,
  render,
  scopeKeyFromViewUri,
  sectionScope,
  viewUriFor
} from './documentViewModel';
import { DoorstopTreeProvider, RequirementTreeItem, sectionUids } from './requirementTree';

/**
 * The Document View (spec 019): one Doorstop document served as a single
 * editable markdown text on the `doorstop-document` scheme.
 *
 * This file owns the per-view state, the FileSystemProvider VS Code reads and
 * saves through, and every server round-trip. Reading is one `GET /tree`;
 * saving diffs the text against a fresh snapshot and writes only what changed,
 * through the server (PATCH/POST/DELETE) - the extension never opens an item
 * file itself. Editor presentation (lenses, decorations, diagnostics) lives in
 * documentViewLanguage.ts. See specs/019-document-view/research.md §1-§8.
 */

export interface Prompts {
  confirmDeletions(uids: string[]): Promise<'delete' | 'keep' | 'cancel'>;
  confirmHeaderChange(uid: string, oldHeader: string, newHeader: string): Promise<'apply' | 'keep'>;
  notifyDiskChange(label: string): Promise<'reload' | 'keep'>;
  confirmDiscard(label: string): Promise<'discard' | 'keep'>;
  reportError(message: string): void;
  reportHint(message: string): void;
}

export const SEPARATOR_HINT = 'This line is managed by Doorstop - use the actions above it';

const defaultPrompts: Prompts = {
  async confirmDeletions(uids) {
    const choice = await vscode.window.showWarningMessage(
      `${uids.join(', ')} would be deleted - Delete / Keep / Cancel`,
      { modal: true },
      'Delete',
      'Keep',
      'Cancel'
    );
    return choice === 'Delete' ? 'delete' : choice === 'Keep' ? 'keep' : 'cancel';
  },
  async confirmHeaderChange(uid, oldHeader, newHeader) {
    const choice = await vscode.window.showWarningMessage(
      `Header of ${uid} changed from '${oldHeader}' to '${newHeader}' - Apply / Keep`,
      { modal: true },
      'Apply',
      'Keep'
    );
    return choice === 'Apply' ? 'apply' : 'keep';
  },
  async confirmDiscard(label) {
    const choice = await vscode.window.showWarningMessage(
      `${label} has unsaved edits - discard them and reload from disk?`,
      { modal: true },
      'Discard my edits',
      'Keep'
    );
    return choice === 'Discard my edits' ? 'discard' : 'keep';
  },
  async notifyDiskChange(label) {
    const choice = await vscode.window.showWarningMessage(label, 'Reload', 'Keep my edits');
    return choice === 'Reload' ? 'reload' : 'keep';
  },
  reportError(message) {
    void vscode.window.showErrorMessage(message);
  },
  reportHint(message) {
    vscode.window.setStatusBarMessage(message, 5000);
  }
};

export interface DocumentViewState {
  /** What the view shows (spec 030); `scope.key` identifies the view. */
  scope: ViewScope;
  /** Header fields shown for editing, fixed when the view was opened (FR-017). */
  fields: string[];
  uri: vscode.Uri;
  /** Directories of the shown items - one item-file watcher each. */
  folders: string[];
  snapshot: DocumentNode;
  /** The text VS Code last read for this view. */
  text: string;
  /** Lines of `text`, kept for the separator-revert rule. */
  lines: string[];
  ctime: number;
  mtime: number;
  blocks: RenderedBlock[];
  /** Lookalike separators inside item text of the current snapshot. */
  renderIssues: StructuralIssue[];
  saving: boolean;
  watchers: vscode.Disposable[];
  watcherTimer?: NodeJS.Timeout;
  watcherUids: Set<string>;
  /** Regeneration sequence: a `/tree` response older than the latest request is dropped. */
  generation: number;
}

export interface DocumentViewOptions {
  server: DoorstopServer;
  tree: DoorstopTreeProvider;
  onChanged: () => void;
  prompts?: Partial<Prompts>;
}

export interface DocumentViewHandle {
  /** Replaceable per entry - extension-host tests inject dialog answers here. */
  prompts: Prompts;
  /** A view URI, a scope key (`doc:SYS`), or a bare document prefix. */
  getState(target: string | vscode.Uri): DocumentViewState | undefined;
  /** A document prefix opens the whole document. */
  openDocumentView(scopeOrPrefix: ViewScope | string): Promise<void>;
  /** Opens the items of a filter result as one view (spec 030 FR-009 to FR-012). */
  openFilterView(uids: string[]): Promise<void>;
  /** Fires after a view's text or snapshot was replaced (regeneration, save). */
  onDidChangeState: vscode.Event<vscode.Uri>;
  /** Exposed for the CodeLens/commands: inserts a placeholder below the block at `line`. */
  insertPlaceholder(document: vscode.TextDocument, line: number): Promise<void>;
}

const REFUSED_SAVE_SUFFIX = ' - use the quick fix "Restore block structure"';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openDocumentFor(uri: vscode.Uri): vscode.TextDocument | undefined {
  const key = uri.toString();
  return vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
}

/** UID an item file name stands for, without confirming it against the index. */
function uidFromFileName(uri: vscode.Uri): string {
  return path.basename(uri.fsPath, path.extname(uri.fsPath));
}

/** Whether `uid` reads differently in `fresh` than in `base` (or exists in only one). */
function itemDiffers(base: DocumentNode, fresh: DocumentNode, uid: string): boolean {
  const before = base.items.find(item => item.uid === uid);
  const after = fresh.items.find(item => item.uid === uid);
  if (!before || !after) {
    return Boolean(before?.active) !== Boolean(after?.active);
  }
  return before.active !== after.active
    || before.level !== after.level
    || (before.header ?? '') !== (after.header ?? '')
    || (before.text ?? '') !== (after.text ?? '')
    || JSON.stringify(before.fields ?? {}) !== JSON.stringify(after.fields ?? {});
}

class DocumentViewFileSystem implements vscode.FileSystemProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changeEmitter.event;

  constructor(
    private readonly getState: (uri: vscode.Uri) => DocumentViewState | undefined,
    private readonly save: (state: DocumentViewState, text: string) => Promise<void>
  ) { }

  fireChanged(uri: vscode.Uri): void {
    this.changeEmitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    if (uri.path === '/' || uri.path === '') {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const state = this.getState(uri);
    if (!state) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: state.ctime,
      mtime: state.mtime,
      size: Buffer.byteLength(state.text, 'utf8')
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const state = this.getState(uri);
    if (!state) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return new TextEncoder().encode(state.text);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const state = this.getState(uri);
    if (!state) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    await this.save(state, new TextDecoder().decode(content));
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
}

export function registerDocumentView(context: vscode.ExtensionContext, options: DocumentViewOptions): DocumentViewHandle {
  const prompts: Prompts = { ...defaultPrompts, ...options.prompts };
  const states = new Map<string, DocumentViewState>();
  const stateEmitter = new vscode.EventEmitter<vscode.Uri>();
  // Strictly increasing so VS Code's etag (mtime + size) always moves when the
  // text is replaced, even within one millisecond.
  let clock = Date.now();
  const tick = (): number => (clock = Math.max(clock + 1, Date.now()));

  let filterCounter = 0;

  const getState = (target: string | vscode.Uri): DocumentViewState | undefined => {
    const key = typeof target === 'string' ? (target.includes(':') ? target : `doc:${target}`) : scopeKeyFromViewUri(target);
    return key ? states.get(key) : undefined;
  };

  const configuredFields = (): { fields: string[]; protectedNames: string[] } =>
    normaliseFieldList(vscode.workspace.getConfiguration('doorstop').get('documentView.fields'));

  /**
   * The snapshot a scope shows: a `DocumentNode` whose items are only the
   * scope's, each tagged with its document (spec 030, research §2). Everything
   * downstream - render, parse, planSave - works on it unchanged.
   */
  const loadSnapshot = (scope: ViewScope, fields: string[]): Promise<DocumentNode> => measure('documentView.load', async () => {
    const query = fields.length > 0 ? `?fields=${encodeURIComponent(fields.join(','))}` : '';
    const tree = await options.server.request<TreeResponse>('GET', `/tree${query}`);
    const tagged = tree.documents.map(document => ({
      ...document,
      items: document.items.map(item => ({ ...item, documentPrefix: document.prefix }))
    }));
    if (scope.kind === 'document') {
      const document = tagged.find(candidate => candidate.prefix === scope.prefix);
      if (!document) {
        throw new Error(`no document with prefix ${scope.prefix}`);
      }
      return document;
    }
    let wanted: Set<string>;
    if (scope.kind === 'section') {
      const owner = tagged.find(document => document.items.some(item => item.uid === scope.rootUid));
      if (!owner) {
        throw new Error('item no longer exists');
      }
      // Items created in the view stay in it even when they land outside the subtree.
      wanted = new Set([...sectionUids(owner.items, scope.rootUid as string), ...(scope.uids ?? [])]);
    } else {
      wanted = new Set(scope.uids);
    }
    const contributing = tagged
      .map(document => ({ document, items: document.items.filter(item => wanted.has(item.uid)) }))
      .filter(entry => entry.items.length > 0);
    if (contributing.length === 0) {
      throw new Error(scope.kind === 'filter' ? 'the filter result is empty - nothing to open' : 'item no longer exists');
    }
    return {
      prefix: scope.label,
      markerPath: contributing[0].document.markerPath,
      items: contributing.flatMap(entry => entry.items)
    };
  });

  /** Directories whose item files the view's watchers observe. */
  const foldersOf = (scope: ViewScope, snapshot: DocumentNode): string[] => {
    const folders = new Set(snapshot.items.map(item => path.dirname(item.path)));
    if (scope.kind === 'document') {
      folders.add(path.dirname(snapshot.markerPath));
    }
    return [...folders];
  };

  /** Replaces the view's text from a snapshot; returns whether the text changed. */
  const applySnapshot = (state: DocumentViewState, snapshot: DocumentNode, forceBump = false): boolean => {
    const rendered = render(snapshot, state.fields);
    state.snapshot = snapshot;
    state.blocks = rendered.blocks;
    state.renderIssues = rendered.issues;
    const changed = rendered.text !== state.text;
    if (changed || forceBump) {
      state.text = rendered.text;
      state.lines = rendered.text.split('\n');
      state.mtime = tick();
    }
    stateEmitter.fire(state.uri);
    return changed || forceBump;
  };

  const fs = new DocumentViewFileSystem(getState, (state, text) => saveView(state, text));

  /**
   * Fresh snapshot -> new text -> VS Code re-reads (research §4). Latest
   * request wins: a slower, older `/tree` response must not overwrite a newer
   * regeneration (own save, watcher event and reopen can all overlap).
   */
  const regenerate = async (state: DocumentViewState, snapshot?: DocumentNode, forceBump = false): Promise<void> => {
    const generation = ++state.generation;
    const fresh = snapshot ?? await loadSnapshot(state.scope, state.fields);
    if (generation !== state.generation) {
      return;
    }
    if (applySnapshot(state, fresh, forceBump)) {
      fs.fireChanged(state.uri);
    }
  };

  const disposeState = (state: DocumentViewState): void => {
    state.watchers.forEach(watcher => watcher.dispose());
    if (state.watcherTimer) {
      clearTimeout(state.watcherTimer);
    }
    states.delete(state.scope.key);
  };

  // ---------------------------------------------------------------- disk changes

  /** VS Code never reloads a dirty model on its own: the regenerated text is put in by reverting the editor. */
  const replaceDirtyView = async (state: DocumentViewState, document: vscode.TextDocument, fresh: DocumentNode): Promise<void> => {
    await regenerate(state, fresh, true);
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    await vscode.commands.executeCommand('workbench.action.files.revert');
  };

  /** The "Reload from disk" lens (spec 030 FR-019 to FR-021). */
  const reloadView = async (state: DocumentViewState): Promise<void> => {
    const document = openDocumentFor(state.uri);
    const dirty = document?.isDirty === true;
    if (dirty && await prompts.confirmDiscard(state.scope.label) === 'keep') {
      return;
    }
    try {
      const fresh = await withDelayedProgress(`Doorstop: Reloading ${state.scope.label}…`, () => loadSnapshot(state.scope, state.fields));
      if (dirty && document) {
        await replaceDirtyView(state, document, fresh);
      } else {
        await regenerate(state, fresh);
      }
    } catch (error) {
      prompts.reportError(`Doorstop: could not reload ${state.scope.label}: ${errorMessage(error)}`);
    }
  };

  const handleDiskChange = async (state: DocumentViewState): Promise<void> => {
    const uids = [...state.watcherUids].sort();
    state.watcherUids.clear();
    if (uids.length === 0 || state.saving) {
      return;
    }
    const document = openDocumentFor(state.uri);
    if (!document?.isDirty) {
      // Idempotent: an echo of the view's own save renders the same text.
      try {
        await regenerate(state);
      } catch (error) {
        console.error('[Doorstop][documentView] refresh after disk change failed:', errorMessage(error));
      }
      return;
    }
    // Only items whose server state differs from what the view was rendered
    // from count: the echo of the view's own save (Doorstop's reorder can
    // touch many files) is not a conflict with the user's new edits.
    let fresh: DocumentNode;
    try {
      fresh = await loadSnapshot(state.scope, state.fields);
    } catch (error) {
      console.error('[Doorstop][documentView] could not check a disk change:', errorMessage(error));
      return;
    }
    const changed = uids.filter(uid => itemDiffers(state.snapshot, fresh, uid));
    if (changed.length === 0) {
      return;
    }
    const label = changed.length <= 3 ? `${changed.join(', ')} changed on disk` : `${state.scope.label} changed on disk`;
    const choice = await prompts.notifyDiskChange(label);
    if (choice !== 'reload') {
      // Nothing to remember: the next save diffs each block against a fresh
      // snapshot, so an item the user did not touch is skipped either way.
      return;
    }
    try {
      await replaceDirtyView(state, document, fresh);
    } catch (error) {
      prompts.reportError(`Doorstop: could not reload ${state.scope.label}: ${errorMessage(error)}`);
    }
  };

  const watchFolder = (state: DocumentViewState, folder: string): vscode.Disposable => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(folder), '**/*.{yml,md}')
    );
    const onEvent = (uri: vscode.Uri): void => {
      state.watcherUids.add(uidFromFileName(uri));
      if (state.watcherTimer) {
        clearTimeout(state.watcherTimer);
      }
      state.watcherTimer = setTimeout(() => {
        state.watcherTimer = undefined;
        void handleDiskChange(state);
      }, DEBOUNCE_MS);
    };
    return vscode.Disposable.from(
      watcher,
      watcher.onDidChange(onEvent),
      watcher.onDidCreate(onEvent),
      watcher.onDidDelete(onEvent)
    );
  };

  // ------------------------------------------------------------------- opening

  const openDocumentView = async (scopeOrPrefix: ViewScope | string): Promise<void> => {
    const scope = typeof scopeOrPrefix === 'string' ? documentScope(scopeOrPrefix) : scopeOrPrefix;
    let state = states.get(scope.key);
    // The setting is read each time a view is opened (FR-017); a view with unsaved
    // edits keeps the fields its text was rendered with.
    const keepFields = state !== undefined && openDocumentFor(state.uri)?.isDirty === true;
    const configured = state && keepFields ? { fields: state.fields, protectedNames: [] as string[] } : configuredFields();
    let snapshot: DocumentNode;
    try {
      snapshot = await withDelayedProgress(`Doorstop: Opening ${scope.label}…`, () => loadSnapshot(scope, configured.fields));
    } catch (error) {
      prompts.reportError(`Doorstop: cannot open ${scope.label}: ${errorMessage(error)}`);
      return;
    }
    if (configured.protectedNames.length > 0) {
      prompts.reportHint(`Doorstop: ignored protected field(s) in doorstop.documentView.fields: ${configured.protectedNames.join(', ')}`);
    }

    if (!state) {
      const rendered = render(snapshot, configured.fields);
      state = {
        scope,
        fields: configured.fields,
        uri: viewUriFor(scope),
        folders: foldersOf(scope, snapshot),
        snapshot,
        text: rendered.text,
        lines: rendered.text.split('\n'),
        ctime: tick(),
        mtime: clock,
        blocks: rendered.blocks,
        renderIssues: rendered.issues,
        saving: false,
        watchers: [],
        watcherUids: new Set(),
        generation: 0
      };
      states.set(scope.key, state);
      const opened = state;
      opened.watchers = opened.folders.map(folder => watchFolder(opened, folder));
    } else if (!openDocumentFor(state.uri)?.isDirty) {
      // A dirty view keeps its edits; a clean one is brought up to date.
      state.fields = configured.fields;
      await regenerate(state, snapshot);
    }

    try {
      let document = await vscode.workspace.openTextDocument(state.uri);
      if (document.languageId !== 'markdown') {
        document = await vscode.languages.setTextDocumentLanguage(document, 'markdown');
      }
      await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
      prompts.reportError(`Doorstop: cannot open ${scope.label}: ${errorMessage(error)}`);
    }
  };

  const openFilterView = async (uids: string[]): Promise<void> => {
    if (!Array.isArray(uids) || uids.length === 0) {
      void vscode.window.showInformationMessage('Doorstop: the filter result is empty - nothing to open.');
      return;
    }
    await openDocumentView(filterScope(++filterCounter, [...uids]));
  };

  // -------------------------------------------------------------------- saving

  const refuse = (message: string): never => {
    throw vscode.FileSystemError.Unavailable(message);
  };

  interface FailedWrite {
    uid?: string;
    afterUid?: string;
    line: number;
    message: string;
  }

  /**
   * A fresh render in which every block whose write failed shows the user's
   * lines instead: failed updates replace their item's block, failed
   * creations re-appear as placeholders after the block they followed.
   */
  const spliceFailedBlocks = (fresh: DocumentNode, fields: string[], userLines: string[], blocks: ParsedBlock[], failed: FailedWrite[]): string => {
    const rendered = render(fresh, fields);
    const freshLines = rendered.text.split('\n');
    const userChunk = (line: number): string[] => {
      const block = blocks.find(candidate => candidate.separatorLine === line);
      return block ? userLines.slice(block.separatorLine, block.endLine + 1) : [];
    };
    const failedUpdates = new Map(failed.filter(entry => entry.uid).map(entry => [entry.uid as string, entry]));
    const failedCreations = failed.filter(entry => !entry.uid);

    const out: string[] = [];
    for (const block of rendered.blocks) {
      if (block.kind === 'item') {
        out.push('');
      }
      const failure = block.uid ? failedUpdates.get(block.uid) : undefined;
      out.push(...(failure ? userChunk(failure.line) : freshLines.slice(block.startLine, block.endLine + 1)));
      for (const creation of failedCreations) {
        if (creation.afterUid === block.uid) {
          out.push('', ...userChunk(creation.line));
        }
      }
    }
    return out.join('\n') + '\n';
  };

  const saveView = async (state: DocumentViewState, text: string): Promise<void> => {
    state.saving = true;
    try {
      let snapshot: DocumentNode;
      try {
        snapshot = await withDelayedProgress(`Doorstop: Saving ${state.scope.label}…`, () => loadSnapshot(state.scope, state.fields));
      } catch (error) {
        return refuse(`Doorstop server unavailable: ${errorMessage(error)}`);
      }
      const renderIssues = render(snapshot, state.fields).issues;
      const blocks = parse(text);
      // Diffed against what the user saw (state.snapshot), validated against
      // what exists now (snapshot) - see planSave.
      const plan: ChangeSet = planSave(blocks, state.snapshot, renderIssues, snapshot, state.fields);
      if (plan.errors.length > 0) {
        const first = plan.errors[0];
        return refuse(`${first.message} (line ${first.line + 1})${REFUSED_SAVE_SUFFIX}`);
      }

      // Every save asks the same questions, auto-save included: a deletion or
      // a header change is never applied without the user seeing the dialog.
      let deletions = plan.deletions;
      if (deletions.length > 0) {
        const answer = await prompts.confirmDeletions(deletions);
        if (answer === 'cancel') {
          return refuse('Save cancelled');
        }
        if (answer === 'keep') {
          deletions = [];
        }
      }
      const updates: ItemUpdate[] = [];
      for (const update of plan.updates) {
        if (update.headerOnly) {
          const answer = await prompts.confirmHeaderChange(update.uid, update.oldHeader, update.header ?? '');
          if (answer === 'keep') {
            continue;
          }
        }
        updates.push(update);
      }

      const failed: FailedWrite[] = [];
      const total = updates.length + plan.creations.length + deletions.length;
      // Only the writes: every confirmation above has been answered (spec 026 FR-005).
      await withDelayedProgress(`Doorstop: Saving ${state.scope.label}…`, async () => {
        for (const update of updates) {
          try {
            await options.server.request('PATCH', `/items/${encodeURIComponent(update.uid)}`, {
              ...(update.header !== undefined ? { header: update.header } : {}),
              ...(update.text !== undefined ? { text: update.text } : {}),
              ...(update.fields !== undefined ? { fields: update.fields } : {})
            });
          } catch (error) {
            failed.push({ uid: update.uid, line: update.line, message: errorMessage(error) });
          }
        }
        for (const creation of plan.creations) {
          try {
            // No block above means "before the current first item"; only an
            // empty document falls through to Doorstop's plain append.
            const position = creation.afterUid
              ? { after: creation.afterUid }
              : snapshot.items.some(item => item.active) ? { first: true } : {};
            // The document of the block above (or of the first block): a section
            // or filter view can span several documents (spec 030, research §7).
            const neighbour = snapshot.items.find(item => item.uid === creation.afterUid)
              ?? snapshot.items.find(item => item.active);
            const prefix = neighbour?.documentPrefix ?? state.scope.prefix;
            if (!prefix) {
              throw new Error('no document to create the item in');
            }
            const added = await options.server.request<AddedItem>('POST', `/documents/${encodeURIComponent(prefix)}/items`, {
              ...position,
              header: creation.header,
              text: creation.text
            });
            // A filter view lists fixed UIDs and a section the subtree at open time:
            // the new item must stay in the view either way.
            if (state.scope.kind !== 'document') {
              state.scope.uids = [...(state.scope.uids ?? []), added.uid];
            }
          } catch (error) {
            failed.push({ afterUid: creation.afterUid, line: creation.line, message: errorMessage(error) });
          }
        }
        for (const uid of deletions) {
          try {
            await options.server.request('DELETE', `/items/${encodeURIComponent(uid)}`);
          } catch (error) {
            const block = blocks.find(candidate => candidate.uid === uid);
            failed.push({ uid, line: block?.separatorLine ?? 0, message: errorMessage(error) });
          }
        }
      });

      if (total > 0) {
        options.onChanged();
        // Views may overlap: bring every other clean view up to date now instead
        // of waiting for its watcher. A dirty one keeps its edits (watcher prompt).
        for (const other of states.values()) {
          if (other !== state && !other.saving && !openDocumentFor(other.uri)?.isDirty) {
            void regenerate(other).catch(error =>
              console.error('[Doorstop][documentView] refresh of an overlapping view failed:', errorMessage(error)));
          }
        }
      }

      let fresh: DocumentNode;
      try {
        fresh = await withDelayedProgress(`Doorstop: Saving ${state.scope.label}…`, () => loadSnapshot(state.scope, state.fields));
      } catch (error) {
        // Written, but the state cannot be confirmed: keep the user's text.
        state.text = text;
        state.lines = text.split('\n');
        return refuse(`saved, but the Doorstop server could not be reached afterwards: ${errorMessage(error)}`);
      }

      if (failed.length === 0) {
        // What VS Code just wrote, with a fresh etag; the regenerated text
        // follows once VS Code has finished its own post-save bookkeeping, so
        // its conditional re-read sees a newer etag and reloads in place.
        state.text = text;
        state.lines = text.split('\n');
        state.mtime = tick();
        setTimeout(() => {
          void regenerate(state, fresh).catch(error =>
            console.error('[Doorstop][documentView] regeneration after save failed:', errorMessage(error)));
        }, 50);
        return;
      }

      // Partial failure (spec FR-021a): the buffer keeps every edit, the
      // failed items are named once, the tab stays dirty. No etag bump - that
      // would trip VS Code's "content is newer" check on the next save.
      const rendered = render(fresh, state.fields);
      state.snapshot = fresh;
      state.blocks = rendered.blocks;
      state.renderIssues = rendered.issues;
      state.text = spliceFailedBlocks(fresh, state.fields, text.split('\n'), blocks, failed);
      state.lines = state.text.split('\n');
      stateEmitter.fire(state.uri);
      const detail = failed.map(entry => `${entry.uid ?? `new item at line ${entry.line + 1}`} (${entry.message})`).join(', ');
      prompts.reportError(`Doorstop: ${failed.length} of ${total} changes could not be saved: ${detail}. The failed blocks keep your edits.`);
      return refuse('some changes could not be saved');
    } finally {
      state.saving = false;
    }
  };

  // ------------------------------------------------------------- placeholders

  const insertPlaceholder = async (document: vscode.TextDocument, line: number): Promise<void> => {
    const blocks = parse(document.getText());
    const point = insertionPointAfterBlock(blocks, line);
    const edit = new vscode.WorkspaceEdit();
    let headingLine: number;
    if (point.insertAtLine >= document.lineCount) {
      const end = document.lineAt(document.lineCount - 1).range.end;
      edit.insert(document.uri, end, `\n${placeholderBlockText(point.depth)}`);
      headingLine = document.lineCount + 2;
    } else {
      edit.insert(document.uri, new vscode.Position(point.insertAtLine, 0), placeholderBlockText(point.depth));
      headingLine = point.insertAtLine + 2;
    }
    if (!(await vscode.workspace.applyEdit(edit))) {
      prompts.reportError('Doorstop: could not insert the new item placeholder.');
      return;
    }
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const cursor = new vscode.Position(headingLine, point.depth + 1);
    editor.selection = new vscode.Selection(cursor, cursor);
    editor.revealRange(new vscode.Range(cursor, cursor), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  };

  const cancelPlaceholder = async (document: vscode.TextDocument, line: number): Promise<void> => {
    const block = parse(document.getText()).find(candidate => candidate.kind === 'placeholder' && candidate.separatorLine === line);
    if (!block) {
      return;
    }
    const startLine = line > 0 && document.lineAt(line - 1).text.trim() === '' ? line - 1 : line;
    const endLine = Math.min(block.endLine + 1, document.lineCount - 1);
    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, new vscode.Range(startLine, 0, endLine, 0));
    await vscode.workspace.applyEdit(edit);
  };

  const documentFromArg = async (arg: { uri?: string } | undefined): Promise<vscode.TextDocument | undefined> => {
    if (arg?.uri) {
      return vscode.workspace.openTextDocument(vscode.Uri.parse(arg.uri));
    }
    const active = vscode.window.activeTextEditor?.document;
    return active && isViewUri(active.uri) ? active : undefined;
  };

  // ------------------------------------------------- keep the reading position

  // Spec 030 FR-018. A view that loses focus and is clicked again must not jump to
  // the start. Where the reset comes from is not observable (no API fires on window
  // focus), so the guard recognises its signature: right after an editor regains
  // focus, a selection change that is not a mouse click or key press and lands
  // exactly on line 1, column 1, while the view had a position further down. That
  // position is put back.
  const REFOCUS_WINDOW_MS = 2000;
  const positions = new Map<string, { selections: readonly vscode.Selection[]; top: number }>();
  let refocusedAt = 0;
  const refocused = (): boolean => Date.now() - refocusedAt < REFOCUS_WINDOW_MS;

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(window => { if (window.focused) { refocusedAt = Date.now(); } }),
    vscode.window.onDidChangeActiveTextEditor(editor => { if (editor && isViewUri(editor.document.uri)) { refocusedAt = Date.now(); } }),
    vscode.window.onDidChangeTextEditorSelection(event => {
      const key = event.textEditor.document.uri.toString();
      if (!isViewUri(event.textEditor.document.uri)) {
        return;
      }
      const stored = positions.get(key);
      const only = event.selections.length === 1 ? event.selections[0] : undefined;
      const userAction = event.kind === vscode.TextEditorSelectionChangeKind.Mouse || event.kind === vscode.TextEditorSelectionChangeKind.Keyboard;
      const jumpedToStart = !userAction && refocused() && only?.isEmpty === true
        && only.active.line === 0 && only.active.character === 0;
      if (jumpedToStart && stored && stored.selections[0].active.line > 0) {
        event.textEditor.selections = [...stored.selections];
        const top = new vscode.Position(stored.top, 0);
        event.textEditor.revealRange(new vscode.Range(top, top), vscode.TextEditorRevealType.AtTop);
        return;
      }
      positions.set(key, { selections: event.selections, top: userAction ? event.textEditor.visibleRanges[0]?.start.line ?? stored?.top ?? 0 : stored?.top ?? 0 });
    }),
    // A reset of the scroll position to the top right after a refocus is not recorded:
    // it must not overwrite the position that is about to be restored.
    vscode.window.onDidChangeTextEditorVisibleRanges(event => {
      const key = event.textEditor.document.uri.toString();
      const stored = positions.get(key);
      const top = event.visibleRanges[0]?.start.line;
      if (!isViewUri(event.textEditor.document.uri) || top === undefined || (top === 0 && (stored?.top ?? 0) > 0 && refocused())) {
        return;
      }
      positions.set(key, { selections: stored?.selections ?? event.textEditor.selections, top });
    })
  );

  // ----------------------------------------------------------- registrations

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(DOCUMENT_VIEW_SCHEME, fs, { isCaseSensitive: true, isReadonly: false }),

    registerCommand('doorstop.openDocumentView', async () => {
      const prefix = await choosePrefix(options.tree);
      if (prefix) {
        await openDocumentView(prefix);
      }
    }),

    registerCommand('doorstop.openAsDocument', async (arg?: unknown) => {
      const node = arg instanceof RequirementTreeItem ? arg : undefined;
      const prefix = node?.itemData.isDoorstopRoot ? node.itemData.prefix : undefined;
      if (typeof prefix !== 'string' || !prefix) {
        void vscode.window.showInformationMessage('Doorstop: select a document in the Doorstop explorer.');
        return;
      }
      await openDocumentView(prefix);
    }),

    registerCommand('doorstop.openSectionAsDocument', async (arg?: unknown) => {
      const uid = arg instanceof RequirementTreeItem ? arg.itemData.uid : undefined;
      if (typeof uid !== 'string' || arg instanceof RequirementTreeItem && arg.itemData.isDoorstopRoot) {
        void vscode.window.showInformationMessage('Doorstop: select an item with sub-elements in the Doorstop explorer.');
        return;
      }
      await openDocumentView(sectionScope(uid));
    }),

    registerCommand('doorstop.documentView.reload', async (arg?: { uri?: string }) => {
      const document = await documentFromArg(arg);
      const state = document && getState(document.uri);
      if (state) {
        await reloadView(state);
      }
    }),

    registerCommand('doorstop.openFilterAsDocument', async (uids?: unknown) => {
      await openFilterView(Array.isArray(uids) ? uids.filter((uid): uid is string => typeof uid === 'string') : []);
    }),

    registerCommand('doorstop.insertItemHere', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isViewUri(editor.document.uri)) {
        void vscode.window.showInformationMessage('Doorstop: open a document view first (Doorstop: Open Document View).');
        return;
      }
      await insertPlaceholder(editor.document, editor.selection.active.line);
    }),

    registerCommand('doorstop.documentView.newItemBelow', async (arg?: { uri?: string; line?: number }) => {
      const document = await documentFromArg(arg);
      if (document) {
        await insertPlaceholder(document, arg?.line ?? 0);
      }
    }),

    registerCommand('doorstop.documentView.cancelPlaceholder', async (arg?: { uri?: string; line?: number }) => {
      const document = await documentFromArg(arg);
      if (document && arg?.line !== undefined) {
        await cancelPlaceholder(document, arg.line);
      }
    }),

    // A tab restored after a window reload arrives without our language mode.
    vscode.workspace.onDidOpenTextDocument(document => {
      if (isViewUri(document.uri) && document.languageId !== 'markdown') {
        void vscode.languages.setTextDocumentLanguage(document, 'markdown');
      }
    }),

    vscode.workspace.onDidCloseTextDocument(document => {
      const state = getState(document.uri);
      // setTextDocumentLanguage closes and reopens the same URI; only a real
      // close leaves no document behind.
      if (state && !openDocumentFor(state.uri)) {
        setTimeout(() => {
          if (!openDocumentFor(state.uri)) {
            disposeState(state);
          }
        }, 500);
      }
    }),

    stateEmitter,
    { dispose: () => [...states.values()].forEach(disposeState) }
  );

  return {
    prompts,
    getState,
    openDocumentView,
    openFilterView,
    onDidChangeState: stateEmitter.event,
    insertPlaceholder
  };
}
