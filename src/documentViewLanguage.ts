import * as vscode from 'vscode';

import { findHeaderLocation } from './definitionProvider';
import {
  DEBOUNCE_MS,
  DOCUMENT_VIEW_SCHEME,
  ParsedBlock,
  StructuralIssue,
  checkStructure,
  documentMarker,
  headerLineFor,
  isViewUri,
  itemSeparator,
  parse
} from './documentViewModel';
import { DocumentViewHandle, DocumentViewState, SEPARATOR_HINT } from './documentViewProvider';
import { DoorstopServer } from './doorstopServer';
import { ItemNode } from './doorstopTypes';
import { ProblemsProvider, SEVERITY_BY_NAME } from './problemsProvider';
import { REVIEW_CHECKS, SUSPECT_LINK_CHECK } from './reviewCodeActionProvider';
import { ClearAllLensContext, ReviewLensContext } from './reviewLensProvider';

/**
 * Editor presentation of the Document View (spec 019): the action line above
 * every block, dimmed separators and alternating block tint, the extension's
 * own structural diagnostics with their "Restore block structure" fixes, the
 * projection of Doorstop's validation problems onto the separator lines with
 * the same review/clear quick fixes item files get, and the immediate revert
 * of edits inside a separator line.
 *
 * Everything here is a synchronous, network-free scan of the document text
 * (like reviewCodeActionProvider.ts): the server's view of the document comes
 * from the provider's snapshot and from what ProblemsProvider already fetched.
 * See specs/019-document-view/research.md §5, §9 and §13.
 */

export interface DocumentViewLanguageOptions {
  documentView: DocumentViewHandle;
  problems: ProblemsProvider | undefined;
  server: DoorstopServer;
}

export const STRUCTURAL_SOURCE = 'doorstop-document';

interface Scan {
  blocks: ParsedBlock[];
  issues: StructuralIssue[];
  /** UIDs with a projected review problem / suspect link, for the lens labels. */
  needsReview: Set<string>;
  suspect: Set<string>;
}

interface LensArg {
  uri: string;
  line: number;
}

interface RestoreArg extends LensArg {
  code: StructuralIssue['code'];
  uid?: string;
}

function codeOf(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (typeof code === 'string') {
    return code;
  }
  return code && typeof code === 'object' && typeof code.value === 'string' ? code.value : undefined;
}

function lineRange(document: vscode.TextDocument, line: number): vscode.Range {
  const clamped = Math.min(Math.max(0, line), document.lineCount - 1);
  return document.lineAt(clamped).range;
}

export function registerDocumentViewLanguage(context: vscode.ExtensionContext, options: DocumentViewLanguageOptions): void {
  const { documentView } = options;
  const collection = vscode.languages.createDiagnosticCollection(STRUCTURAL_SOURCE);
  const separatorDecoration = vscode.window.createTextEditorDecorationType({ opacity: '0.55', fontStyle: 'italic' });
  const altBlockDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('doorstop.documentView.altBlockBackground')
  });
  const lensEmitter = new vscode.EventEmitter<void>();
  const scans = new Map<string, Scan>();
  const timers = new Map<string, NodeJS.Timeout>();
  /** Text as of the last change event, for the separator-revert rule. */
  const previousLines = new Map<string, string[]>();
  let restoring = false;

  const stateFor = (document: vscode.TextDocument): DocumentViewState | undefined =>
    isViewUri(document.uri) ? documentView.getState(document.uri) : undefined;

  const itemOf = (state: DocumentViewState, uid: string): ItemNode | undefined =>
    state.snapshot.items.find(item => item.uid === uid);

  // ------------------------------------------------------------------ scanning

  const projectProblems = (state: DocumentViewState, blocks: ParsedBlock[], document: vscode.TextDocument, scan: Scan): vscode.Diagnostic[] => {
    const last = options.problems?.getLastRefresh();
    if (!last) {
      return [];
    }
    const lineByUid = new Map<string, number>();
    for (const block of blocks) {
      if (block.kind === 'item' && block.uid && !lineByUid.has(block.uid)) {
        lineByUid.set(block.uid, block.separatorLine);
      }
    }
    const diagnostics: vscode.Diagnostic[] = [];
    for (const issue of last.validation.issues) {
      if (issue.documentPrefix !== state.prefix) {
        continue;
      }
      for (const uid of issue.uids) {
        const line = lineByUid.get(uid);
        if (line === undefined) {
          continue;
        }
        const diagnostic = new vscode.Diagnostic(
          lineRange(document, line),
          issue.message,
          SEVERITY_BY_NAME[issue.severity] ?? vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'doorstop';
        diagnostic.code = issue.check;
        diagnostics.push(diagnostic);
        if (REVIEW_CHECKS.has(issue.check)) {
          scan.needsReview.add(uid);
        }
        if (issue.check === SUSPECT_LINK_CHECK) {
          scan.suspect.add(uid);
        }
      }
    }
    return diagnostics;
  };

  const decorate = (document: vscode.TextDocument, scan: Scan): void => {
    const separators: vscode.Range[] = [];
    const tinted: vscode.Range[] = [];
    let index = 0;
    for (const block of scan.blocks) {
      if (block.kind === 'orphan') {
        continue;
      }
      separators.push(lineRange(document, block.separatorLine));
      if (block.kind === 'item' || block.kind === 'placeholder') {
        if (index % 2 === 1) {
          tinted.push(new vscode.Range(block.separatorLine, 0, block.endLine, lineRange(document, block.endLine).end.character));
        }
        index++;
      }
    }
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === document.uri.toString()) {
        editor.setDecorations(separatorDecoration, separators);
        editor.setDecorations(altBlockDecoration, tinted);
      }
    }
  };

  const scanNow = (document: vscode.TextDocument): Scan | undefined => {
    const state = stateFor(document);
    if (!state) {
      return undefined;
    }
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const blocks = parse(text);
    const issues = checkStructure(blocks, lines, state.blocks);
    // Lookalike lines are anchored to the rendered text; they stay valid only
    // while the document still reads exactly as rendered.
    if (text === state.text) {
      issues.push(...state.renderIssues);
    }
    const scan: Scan = { blocks, issues, needsReview: new Set(), suspect: new Set() };
    scans.set(document.uri.toString(), scan);

    const structural = issues.map(issue => {
      const diagnostic = new vscode.Diagnostic(
        lineRange(document, issue.line),
        issue.message,
        issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = STRUCTURAL_SOURCE;
      diagnostic.code = issue.code;
      return diagnostic;
    });
    collection.set(document.uri, [...structural, ...projectProblems(state, blocks, document, scan)]);
    decorate(document, scan);
    lensEmitter.fire();
    return scan;
  };

  const scheduleScan = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const pending = timers.get(key);
    if (pending) {
      clearTimeout(pending);
    }
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      scanNow(document);
    }, DEBOUNCE_MS));
  };

  const scanOf = (document: vscode.TextDocument): Scan | undefined =>
    scans.get(document.uri.toString()) ?? scanNow(document);

  const openViews = (): vscode.TextDocument[] =>
    vscode.workspace.textDocuments.filter(document => isViewUri(document.uri));

  // ------------------------------------------------------- separator revert

  const revertSeparatorEdit = async (event: vscode.TextDocumentChangeEvent, state: DocumentViewState): Promise<boolean> => {
    const key = event.document.uri.toString();
    const before = previousLines.get(key) ?? state.lines;
    if (event.contentChanges.length !== 1) {
      return false;
    }
    const change = event.contentChanges[0];
    const line = change.range.start.line;
    if (change.range.end.line !== line) {
      return false;
    }
    const original = before[line];
    const wasManaged = original !== undefined && state.blocks.some(block => block.separator === original)
      || original === documentMarker(state.prefix)
      || original === '<!-- new item -->';
    if (!wasManaged) {
      return false;
    }
    // The edited region now spans as many lines as the inserted text has.
    const insertedLines = change.text.split('\n').length - 1;
    const lastLine = line + insertedLines;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(event.document.uri, new vscode.Range(line, 0, lastLine, event.document.lineAt(Math.min(lastLine, event.document.lineCount - 1)).text.length), original);
    restoring = true;
    try {
      await vscode.workspace.applyEdit(edit);
    } finally {
      restoring = false;
    }
    documentView.prompts.reportHint(SEPARATOR_HINT);
    return true;
  };

  // ------------------------------------------------------------ code lenses

  const lens = (document: vscode.TextDocument, line: number, title: string, command?: string, ...args: unknown[]): vscode.CodeLens =>
    new vscode.CodeLens(lineRange(document, line), { title, command: command ?? '', arguments: args });

  const lensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: lensEmitter.event,
    provideCodeLenses(document) {
      const state = stateFor(document);
      const scan = state ? scanOf(document) : undefined;
      if (!state || !scan) {
        return [];
      }
      const uri = document.uri.toString();
      const lenses: vscode.CodeLens[] = [];
      for (const block of scan.blocks) {
        const line = block.separatorLine;
        const below: LensArg = { uri, line };
        if (block.kind === 'document') {
          lenses.push(lens(document, line, '+ New item below', 'doorstop.documentView.newItemBelow', below));
          continue;
        }
        if (block.kind === 'placeholder') {
          lenses.push(lens(document, line, 'new item'));
          lenses.push(lens(document, line, 'Cancel', 'doorstop.documentView.cancelPlaceholder', below));
          continue;
        }
        if (block.kind !== 'item' || !block.uid) {
          continue;
        }
        const uid = block.uid;
        const item = itemOf(state, uid);
        if (!item) {
          lenses.push(lens(document, line, uid));
          lenses.push(lens(document, line, '+ New item below', 'doorstop.documentView.newItemBelow', below));
          continue;
        }
        const itemUri = vscode.Uri.file(item.path);
        const reviewContext: ReviewLensContext = { uid, documentUri: uri };
        lenses.push(lens(document, line, uid, 'doorstop.documentView.openItem', { uid, path: item.path }));
        lenses.push(lens(document, line, 'Open item', 'doorstop.documentView.openItem', { uid, path: item.path }));
        lenses.push(lens(document, line, scan.needsReview.has(uid) ? 'Do Review' : 'Review', 'doorstop.doReview', reviewContext));
        lenses.push(lens(document, line, 'Derive', 'doorstop.deriveRequirement', { sourceUid: uid, sourceUri: itemUri }));
        lenses.push(lens(document, line, 'Link...', 'doorstop.link', { childUid: uid }));
        const count = item.links.length;
        const linksTitle = count === 0 ? 'no links' : count === 1 ? '1 link' : `${count} links`;
        lenses.push(lens(document, line, linksTitle, 'doorstop.showCallHierarchy', { resourceUri: itemUri, itemData: { uid } }));
        if (scan.suspect.has(uid)) {
          lenses.push(lens(document, line, 'Clear suspect link', 'doorstop.clearAllSuspicions', { uid, documentUri: uri } satisfies ClearAllLensContext));
        }
        lenses.push(lens(document, line, '+ New item below', 'doorstop.documentView.newItemBelow', below));
      }
      return lenses;
    }
  };

  // ----------------------------------------------------------- code actions

  const quickFix = (title: string, command: string, argument: unknown, diagnostic: vscode.Diagnostic, preferred: boolean): vscode.CodeAction => {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.command = { command, title, arguments: [argument] };
    action.diagnostics = [diagnostic];
    action.isPreferred = preferred;
    return action;
  };

  const codeActionProvider: vscode.CodeActionProvider = {
    provideCodeActions(document, range) {
      const state = stateFor(document);
      if (!state) {
        return [];
      }
      const uri = document.uri.toString();
      const actions: vscode.CodeAction[] = [];
      const diagnostics = vscode.languages.getDiagnostics(document.uri)
        .filter(diagnostic => diagnostic.range.start.line <= range.end.line && range.start.line <= diagnostic.range.end.line);
      const scan = scanOf(document);
      for (const diagnostic of diagnostics) {
        const code = codeOf(diagnostic);
        const line = diagnostic.range.start.line;
        if (diagnostic.source === STRUCTURAL_SOURCE && code) {
          const issue = scan?.issues.find(candidate => candidate.line === line && candidate.code === code);
          const uid = issue?.uid;
          actions.push(quickFix(
            uid ? `Restore block structure of ${uid}` : 'Restore block structure',
            'doorstop.documentView.restoreBlock',
            { uri, code: code as StructuralIssue['code'], line, uid } satisfies RestoreArg,
            diagnostic,
            true
          ));
          continue;
        }
        if (diagnostic.source !== 'doorstop' || !code) {
          continue;
        }
        const block = scan?.blocks.find(candidate => candidate.kind === 'item' && candidate.separatorLine === line);
        if (!block?.uid) {
          continue;
        }
        const uid = block.uid;
        if (REVIEW_CHECKS.has(code)) {
          actions.push(quickFix('Do Review', 'doorstop.doReview', { uid, documentUri: uri } satisfies ReviewLensContext, diagnostic, true));
        }
        if (code === SUSPECT_LINK_CHECK) {
          const argument: ClearAllLensContext = { uid, documentUri: uri };
          actions.push(quickFix('Clear Suspect Link', 'doorstop.clearAllSuspicions', argument, diagnostic, true));
          const suspectCount = diagnostics.filter(candidate => candidate.range.start.line === line && codeOf(candidate) === SUSPECT_LINK_CHECK).length;
          if (suspectCount >= 2) {
            actions.push(quickFix('Clear All Suspect Links', 'doorstop.clearAllSuspicions', argument, diagnostic, false));
          }
        }
      }
      return actions;
    }
  };

  // --------------------------------------------------------------- commands

  const restoreBlock = async (arg: RestoreArg): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(arg.uri));
    const state = stateFor(document);
    if (!state) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    const item = arg.uid ? itemOf(state, arg.uid) : undefined;
    const lineText = (line: number): string => line < document.lineCount ? document.lineAt(line).text : '';
    switch (arg.code) {
      case 'separator-changed':
        edit.replace(document.uri, lineRange(document, arg.line), item ? itemSeparator(item.uid, item.level) : documentMarker(state.prefix));
        break;
      case 'missing-header': {
        if (!item) {
          return;
        }
        const header = headerLineFor(item);
        if (lineText(arg.line).trim() === '' && arg.line < document.lineCount) {
          edit.replace(document.uri, lineRange(document, arg.line), header);
        } else if (lineText(arg.line) === itemSeparator(item.uid, item.level)) {
          edit.insert(document.uri, lineRange(document, arg.line).end, `\n${header}`);
        } else {
          edit.insert(document.uri, new vscode.Position(arg.line, 0), `${header}\n`);
        }
        break;
      }
      case 'separator-duplicated':
        edit.delete(document.uri, new vscode.Range(arg.line, 0, Math.min(arg.line + 1, document.lineCount - 1), 0));
        break;
      case 'placeholder-empty-heading': {
        const block = parse(document.getText()).find(candidate =>
          candidate.kind === 'placeholder' && (candidate.headerLine === arg.line || candidate.separatorLine === arg.line));
        if (block) {
          await vscode.commands.executeCommand('doorstop.documentView.cancelPlaceholder', { uri: arg.uri, line: block.separatorLine });
        }
        return;
      }
      case 'text-before-first-separator': {
        let offset = 0;
        if (lineText(0) !== documentMarker(state.prefix)) {
          edit.insert(document.uri, new vscode.Position(0, 0), `${documentMarker(state.prefix)}\n\n`);
          offset = 2;
        }
        const present = new Set(parse(document.getText()).filter(block => block.kind === 'item').map(block => block.uid));
        const missing = state.snapshot.items.find(candidate => candidate.active && !present.has(candidate.uid));
        if (missing) {
          edit.insert(document.uri, new vscode.Position(arg.line, 0), `${itemSeparator(missing.uid, missing.level)}\n`);
        } else if (offset === 0) {
          documentView.prompts.reportHint('Every item still has its separator - move or delete the text above the first block');
          return;
        }
        break;
      }
      default:
        documentView.prompts.reportHint(arg.code === 'separator-lookalike'
          ? 'Edit this item in its own file'
          : `${arg.uid ?? 'This separator'} is not an item of this document - remove the separator line`);
        return;
    }
    await vscode.workspace.applyEdit(edit);
  };

  const openItem = async (arg: { uid: string; path: string }): Promise<void> => {
    const uri = vscode.Uri.file(arg.path);
    try {
      const header = await findHeaderLocation(uri);
      await vscode.window.showTextDocument(uri, { selection: header.range });
    } catch (error) {
      documentView.prompts.reportError(`Doorstop: cannot open ${arg.uid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ---------------------------------------------------------- registrations

  const selector: vscode.DocumentSelector = { scheme: DOCUMENT_VIEW_SCHEME };
  context.subscriptions.push(
    collection,
    separatorDecoration,
    altBlockDecoration,
    lensEmitter,
    vscode.languages.registerCodeLensProvider(selector, lensProvider),
    vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.commands.registerCommand('doorstop.documentView.restoreBlock', restoreBlock),
    vscode.commands.registerCommand('doorstop.documentView.openItem', openItem),

    vscode.workspace.onDidChangeTextDocument(event => {
      const state = stateFor(event.document);
      if (!state) {
        return;
      }
      const key = event.document.uri.toString();
      if (!restoring) {
        void revertSeparatorEdit(event, state).finally(() => {
          previousLines.set(key, event.document.getText().split(/\r?\n/));
        });
      } else {
        previousLines.set(key, event.document.getText().split(/\r?\n/));
      }
      scheduleScan(event.document);
    }),

    vscode.workspace.onDidOpenTextDocument(document => {
      if (isViewUri(document.uri)) {
        previousLines.set(document.uri.toString(), document.getText().split(/\r?\n/));
        scanNow(document);
      }
    }),

    vscode.workspace.onDidCloseTextDocument(document => {
      if (isViewUri(document.uri)) {
        const key = document.uri.toString();
        collection.delete(document.uri);
        scans.delete(key);
        previousLines.delete(key);
      }
    }),

    documentView.onDidChangeState(uri => {
      const document = vscode.workspace.textDocuments.find(candidate => candidate.uri.toString() === uri.toString());
      if (document) {
        previousLines.set(uri.toString(), document.getText().split(/\r?\n/));
        scanNow(document);
      }
    }),

    vscode.window.onDidChangeVisibleTextEditors(() => {
      for (const document of openViews()) {
        const scan = scans.get(document.uri.toString());
        if (scan) {
          decorate(document, scan);
        }
      }
    }),

    { dispose: () => timers.forEach(timer => clearTimeout(timer)) }
  );

  if (options.problems) {
    context.subscriptions.push(options.problems.onDidRefresh(() => {
      for (const document of openViews()) {
        scanNow(document);
      }
    }));
  }

  for (const document of openViews()) {
    scanNow(document);
  }
}
