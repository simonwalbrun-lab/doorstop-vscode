import * as vscode from 'vscode';

import { DoorstopApiError, DoorstopServer } from './doorstopServer';
import { withDelayedProgress } from './progress';
import { measure } from './timing';
import { DocumentNode, FieldAnchor, TreeResponse, ValidationIssue, ValidationResponse } from './doorstopTypes';

/**
 * Renders Doorstop's own validation output as editor diagnostics.
 *
 * The division of labour is deliberate: the server decides *what* is a problem
 * and *which field* it concerns (that is Doorstop knowledge), and this file
 * decides *which line* that field is on (that is VS Code knowledge). Nothing
 * here inspects `message` or re-derives a severity - see
 * specs/014-doorstop-validation-diagnostics/research.md sections 4 and 5.
 *
 * Problems describe the state **on disk**. A dirty buffer may lag until it is
 * saved, which matches how Doorstop validates (it reloads each item from disk).
 */

const DEBOUNCE_MS = 300;

export interface ProblemsProviderOptions {
  server: DoorstopServer;
  workspaceFolder: vscode.WorkspaceFolder;
  /** Overridable so tests can observe failure reports without a modal. */
  reportFailure?: (message: string) => void;
}

/** Where one issue lands, for one of the items it names. */
interface AnchorResolution {
  uri: vscode.Uri;
  range: vscode.Range;
  /** True when the intended field was absent and the first-line fallback applied. */
  fallbackUsed: boolean;
}

export const SEVERITY_BY_NAME: Record<ValidationIssue['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information
};

/** The YAML key each anchor field lives under. `ref` also accepts `references`. */
const FIELD_KEYS: Partial<Record<FieldAnchor, string[]>> = {
  level: ['level'],
  text: ['text'],
  reviewed: ['reviewed'],
  links: ['links'],
  derived: ['derived'],
  ref: ['ref', 'references']
};

/** A YAML sequence entry, capturing the UID token before an optional `: stamp`. */
const LINK_ENTRY_REGEX = /^\s*-\s+([^\s:]+)\s*(?::|$)/;
const LINKS_KEY_REGEX = /^\s*links\s*:/i;
const FRONTMATTER_FENCE_REGEX = /^---\s*$/;

function keyRegex(key: string): RegExp {
  return new RegExp(`^\\s*${key}\\s*:`, 'i');
}

function lineRange(line: number, text?: string): vscode.Range {
  return new vscode.Range(line, 0, line, text?.length ?? 0);
}

/**
 * Reads each file at most once per refresh pass. A single validation run can
 * name the same item many times over, and the file contents cannot change
 * mid-pass - the problems describe one on-disk snapshot.
 */
class FileTextCache {
  private readonly lines = new Map<string, string[]>();

  async getLines(uri: vscode.Uri): Promise<string[] | undefined> {
    const key = uri.toString();
    const cached = this.lines.get(key);
    if (cached) {
      return cached;
    }
    try {
      const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      // CRLF on Windows - the same split the other providers use.
      const lines = raw.split(/\r?\n/);
      this.lines.set(key, lines);
      return lines;
    } catch (error) {
      console.error(
        `[Doorstop][problems] Could not read ${uri.fsPath}:`,
        error instanceof Error ? error.message : String(error)
      );
      return undefined;
    }
  }
}

/**
 * The metadata region of an item file: the whole file for an attribute-format
 * item, and only the `---` frontmatter for a markdown one - so a `links:` line
 * written in the prose body cannot capture an anchor.
 */
function getMetadataRange(lines: string[], isMarkdown: boolean): { start: number; end: number } {
  if (!isMarkdown) {
    return { start: 0, end: lines.length };
  }
  if (lines.length === 0 || !FRONTMATTER_FENCE_REGEX.test(lines[0])) {
    return { start: 0, end: 0 };
  }
  for (let line = 1; line < lines.length; line++) {
    if (FRONTMATTER_FENCE_REGEX.test(lines[line])) {
      return { start: 1, end: line };
    }
  }
  return { start: 1, end: lines.length };
}

function findKeyLine(
  lines: string[],
  keys: string[],
  range: { start: number; end: number }
): number | undefined {
  for (let line = range.start; line < range.end; line++) {
    if (keys.some(key => keyRegex(key).test(lines[line]))) {
      return line;
    }
  }
  return undefined;
}

/**
 * The link entry whose UID token equals `relatedUid`, searched only inside the
 * consecutive sequence entries that follow the `links:` key.
 */
function findLinkEntryLine(
  lines: string[],
  relatedUid: string,
  range: { start: number; end: number }
): number | undefined {
  const linksLine = findKeyLine(lines, ['links'], range);
  if (linksLine === undefined) {
    return undefined;
  }
  for (let line = linksLine + 1; line < range.end; line++) {
    const match = LINK_ENTRY_REGEX.exec(lines[line]);
    if (!match) {
      break;
    }
    if (match[1] === relatedUid) {
      return line;
    }
  }
  return undefined;
}

/** The last non-empty line of a markdown item - where an empty-text warning lands (FR-007). */
function lastContentLine(lines: string[]): number {
  for (let line = lines.length - 1; line >= 0; line--) {
    if (lines[line].trim().length > 0) {
      return line;
    }
  }
  return 0;
}

interface TreeIndex {
  pathByUid: Map<string, string>;
  documentByUid: Map<string, DocumentNode>;
  documentByPrefix: Map<string, DocumentNode>;
}

function indexTree(tree: TreeResponse): TreeIndex {
  const pathByUid = new Map<string, string>();
  const documentByUid = new Map<string, DocumentNode>();
  const documentByPrefix = new Map<string, DocumentNode>();
  for (const document of tree.documents) {
    documentByPrefix.set(document.prefix, document);
    for (const item of document.items) {
      pathByUid.set(item.uid, item.path);
      documentByUid.set(item.uid, document);
    }
  }
  return { pathByUid, documentByUid, documentByPrefix };
}

/**
 * Resolves one issue, for one of the items it names, to a place in a file.
 * Never fails: every step falls through to the item's first line, so no problem
 * is dropped for want of an anchor (FR-010, FR-011).
 */
export async function resolveAnchor(
  issue: ValidationIssue,
  uid: string | undefined,
  index: TreeIndex,
  cache: FileTextCache
): Promise<AnchorResolution | undefined> {
  const document = uid ? index.documentByUid.get(uid) : index.documentByPrefix.get(issue.documentPrefix);
  const documentMarker = document ?? index.documentByPrefix.get(issue.documentPrefix);

  // Document-level issue, or an item the server named but the tree does not
  // place: annotate the document's config file rather than dropping the problem.
  const itemPath = uid ? index.pathByUid.get(uid) : undefined;
  if (!itemPath) {
    if (!documentMarker) {
      return undefined;
    }
    return {
      uri: vscode.Uri.file(documentMarker.markerPath),
      range: new vscode.Range(0, 0, 0, 0),
      fallbackUsed: uid !== undefined
    };
  }

  const uri = vscode.Uri.file(itemPath);
  const lines = await cache.getLines(uri);
  if (!lines) {
    return { uri, range: new vscode.Range(0, 0, 0, 0), fallbackUsed: true };
  }

  const isMarkdown = itemPath.toLowerCase().endsWith('.md');
  const range = getMetadataRange(lines, isMarkdown);

  let line: number | undefined;
  if (issue.field === 'link_entry' && issue.relatedUid) {
    line = findLinkEntryLine(lines, issue.relatedUid, range);
  } else if (issue.field === 'text' && isMarkdown) {
    // A markdown item's text is its prose body, not a `text:` key (FR-007).
    line = lastContentLine(lines);
  } else if (issue.field) {
    const keys = FIELD_KEYS[issue.field];
    line = keys ? findKeyLine(lines, keys, range) : undefined;
  }

  const fallbackUsed = line === undefined;
  const anchorLine = line ?? range.start;
  return {
    uri,
    range: lineRange(anchorLine, lines[anchorLine]),
    fallbackUsed
  };
}

function buildDiagnostic(issue: ValidationIssue, anchor: AnchorResolution): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    anchor.range,
    issue.message,
    SEVERITY_BY_NAME[issue.severity] ?? vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = 'doorstop';
  diagnostic.code = issue.check;
  return diagnostic;
}

/**
 * Turns a whole validation response into the diagnostics for each file.
 * Exported for tests: this is the pure half, with no collection and no timers.
 */
export async function buildDiagnostics(
  validation: ValidationResponse,
  tree: TreeResponse
): Promise<Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>> {
  const index = indexTree(tree);
  const cache = new FileTextCache();
  const byFile = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

  for (const issue of validation.issues) {
    // One diagnostic per named item, all carrying the same message and severity
    // (FR-005). An issue naming no item is a document-level one.
    const targets: (string | undefined)[] = issue.uids.length > 0 ? issue.uids : [undefined];
    for (const uid of targets) {
      const anchor = await resolveAnchor(issue, uid, index, cache);
      if (!anchor) {
        console.warn('[Doorstop][problems] No anchor for issue, dropping:', issue.check, uid);
        continue;
      }
      const key = anchor.uri.toString();
      const entry = byFile.get(key) ?? { uri: anchor.uri, diagnostics: [] };
      entry.diagnostics.push(buildDiagnostic(issue, anchor));
      byFile.set(key, entry);
    }
  }
  return byFile;
}

/** When problems are checked (spec 032): after every change, only on Refresh, or never. */
export type ProblemReportingMode = 'automatic' | 'onDemand' | 'off';

export function problemReportingMode(): ProblemReportingMode {
  return vscode.workspace.getConfiguration('doorstop').get<ProblemReportingMode>('problemReporting', 'automatic');
}

/**
 * Keeps the tree view's mode button and the provider in step with the setting,
 * whoever changed it - button, Settings UI or settings file (spec 032 FR-019).
 * The context key picks which of the three button commands is shown.
 */
export function watchProblemReportingMode(
  problems: () => ProblemsProvider | undefined,
  setContext: (mode: ProblemReportingMode) => unknown = mode =>
    vscode.commands.executeCommand('setContext', 'doorstop.problemReporting', mode)
): vscode.Disposable {
  setContext(problemReportingMode());
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('doorstop.problemReporting')) {
      setContext(problemReportingMode());
      problems()?.setMode(problemReportingMode());
    }
  });
}

export interface ProblemsRefresh {
  /** As the server reported it: re-filtering and the status report start from here. */
  unfiltered: ValidationResponse;
  /** Without the problem kinds switched off in the settings (spec 020 US1). */
  validation: ValidationResponse;
  tree: TreeResponse;
}

export interface ProblemsProvider {
  /** Checks now, bypassing the debounce; does nothing in Off mode. */
  refreshNow(): Promise<void>;
  /** Checks after the debounce interval, superseding any pending refresh; Automatic mode only. */
  scheduleRefresh(): void;
  /** A check the user asked for (Refresh): cancellable notification, nothing in Off mode (spec 032 FR-008). */
  checkExplicitly(): Promise<void>;
  /** Re-applies the per-kind settings to the last result without a new check (spec 032 FR-015). */
  refilter(): Promise<void>;
  /** Applies a mode change (spec 032 data-model "Mode transitions"). */
  setMode(mode: ProblemReportingMode): void;
  /** Fires after every successful pass, and with undefined when problems are cleared (spec 019 projection). */
  readonly onDidRefresh: vscode.Event<ProblemsRefresh | undefined>;
  /** The last successful pass, or undefined after a failure or in Off mode. */
  getLastRefresh(): ProblemsRefresh | undefined;
}

/** A check the server stopped (409 CANCELLED, spec 032 R3) or the client aborted: not a failure (FR-009). */
function cancellationOf(error: unknown): 'changed' | 'other' | undefined {
  if (error instanceof DoorstopApiError && error.code === 'CANCELLED') {
    return error.message === 'changed' ? 'changed' : 'other';
  }
  return error instanceof Error && error.name === 'AbortError' ? 'other' : undefined;
}

export function registerProblemsProvider(
  context: vscode.ExtensionContext,
  options: ProblemsProviderOptions
): ProblemsProvider {
  const collection = vscode.languages.createDiagnosticCollection('doorstop');
  const reportFailure = options.reportFailure
    ?? ((message: string) => void vscode.window.showWarningMessage(message));

  let mode = problemReportingMode();
  let debounceTimer: NodeJS.Timeout | undefined;
  // Only the newest refresh may write to the collection: a burst of saves
  // collapses to one visible result instead of racing older responses onto
  // the screen.
  let latestPass = 0;
  // The request of the newest pass; a newer pass or Off aborts it (spec 032 FR-002).
  let running: AbortController | undefined;
  // Guards the failure notification so it fires once per failure transition,
  // not once per debounce tick.
  let lastPassFailed = false;
  const refreshEmitter = new vscode.EventEmitter<ProblemsRefresh | undefined>();
  let lastRefresh: ProblemsRefresh | undefined;
  // The newest pass, so a superseded refreshNow() resolves only once the
  // collection reflects a result - not while a newer pass is still in flight.
  let latestRun: Promise<void> = Promise.resolve();

  const filtered = (unfiltered: ValidationResponse): ValidationResponse => {
    // Problem kinds the user switched off in the settings (spec 020 US1) are
    // dropped here, so the Problems panel and the document view agree.
    const enabled = vscode.workspace.getConfiguration('doorstop').get<Record<string, boolean>>('problems', {});
    return { issues: unfiltered.issues.filter(issue => enabled[issue.check] !== false) };
  };

  // Replaces the whole set at once, so a problem that has been fixed - or an
  // item that no longer exists - disappears (FR-016), and nothing half-built
  // is ever on screen (spec 032 FR-004).
  const show = (refresh: ProblemsRefresh, byFile: Awaited<ReturnType<typeof buildDiagnostics>>): void => {
    collection.clear();
    for (const entry of byFile.values()) {
      collection.set(entry.uri, entry.diagnostics);
    }
    lastRefresh = refresh;
    refreshEmitter.fire(refresh);
  };

  const runPass = async (pass: number, signal: AbortSignal): Promise<void> => {
    try {
      const [unfiltered, tree] = await measure('validation.run', () => Promise.all([
        options.server.request<ValidationResponse>('GET', '/validate', undefined, { signal }),
        options.server.request<TreeResponse>('GET', '/tree')
      ]));
      const validation = filtered(unfiltered);
      const byFile = await buildDiagnostics(validation, tree);
      if (pass !== latestPass) {
        return latestRun;
      }
      lastPassFailed = false;
      show({ unfiltered, validation, tree }, byFile);
    } catch (error) {
      if (pass !== latestPass) {
        return latestRun;
      }
      const cancelled = cancellationOf(error);
      if (cancelled) {
        // The previous problems stay and nothing is reported (FR-009). A check
        // stopped by a change still owes a result for the new state (R5).
        if (cancelled === 'changed') {
          debounced();
        }
        return;
      }
      // Never leave stale problems on screen presenting themselves as current
      // (FR-014): an empty list plus a message is unambiguous, a five-minute-old
      // list is not.
      collection.clear();
      lastRefresh = undefined;
      if (!lastPassFailed) {
        lastPassFailed = true;
        const message = error instanceof Error ? error.message : String(error);
        reportFailure(`Doorstop could not check for problems: ${message}`);
      }
    }
  };

  const start = (wrap: (work: () => Promise<void>, controller: AbortController) => Promise<void>): Promise<void> => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    running?.abort();
    const controller = new AbortController();
    running = controller;
    const pass = ++latestPass;
    latestRun = wrap(() => runPass(pass, controller.signal), controller);
    return latestRun;
  };

  // Background work the user did not trigger: the status-bar spinner, no
  // notification (Principle VII exemption, spec 032 FR-007).
  const refreshNow = (): Promise<void> => mode === 'off'
    ? Promise.resolve()
    : start(work => withDelayedProgress('Checking Doorstop problems…', work, { location: vscode.ProgressLocation.Window }));

  const checkExplicitly = (): Promise<void> => mode === 'off'
    ? Promise.resolve()
    : start((work, controller) => withDelayedProgress('Doorstop: Checking problems…', (_report, token) => {
      token.onCancellationRequested(() => controller.abort());
      return work();
    }, { cancellable: true }));

  function debounced(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void refreshNow();
    }, DEBOUNCE_MS);
  }

  const scheduleRefresh = (): void => {
    if (mode === 'automatic') {
      debounced();
    }
  };

  const refilter = async (): Promise<void> => {
    const source = lastRefresh;
    if (!source) {
      return;
    }
    const validation = filtered(source.unfiltered);
    const byFile = await buildDiagnostics(validation, source.tree);
    // A newer pass or Off may have replaced the result while anchors resolved.
    if (lastRefresh === source) {
      show({ ...source, validation }, byFile);
    }
  };

  const setMode = (next: ProblemReportingMode): void => {
    mode = next;
    if (next === 'automatic') {
      void refreshNow();
    } else if (next === 'off') {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      running?.abort();
      latestPass++;
      latestRun = Promise.resolve();
      collection.clear();
      lastRefresh = undefined;
      refreshEmitter.fire(undefined);
    }
    // onDemand: a running check is not obsolete; it finishes and is shown.
  };

  const isRequirementFile = (document: vscode.TextDocument): boolean => {
    const fsPath = document.uri.fsPath.toLowerCase();
    return (fsPath.endsWith('.yml') || fsPath.endsWith('.md'))
      && fsPath.startsWith(options.workspaceFolder.uri.fsPath.toLowerCase());
  };

  const onSave = vscode.workspace.onDidSaveTextDocument(document => {
    if (isRequirementFile(document)) {
      scheduleRefresh();
    }
  });

  context.subscriptions.push(
    collection,
    refreshEmitter,
    onSave,
    { dispose: () => debounceTimer && clearTimeout(debounceTimer) }
  );

  return {
    refreshNow,
    scheduleRefresh,
    checkExplicitly,
    refilter,
    setMode,
    onDidRefresh: refreshEmitter.event,
    getLastRefresh: () => lastRefresh
  };
}
