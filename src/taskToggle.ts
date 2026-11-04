import * as vscode from 'vscode';

import { isViewUri, itemBodyAt, parse } from './documentViewModel';
import { inDoorstopDocument, textRange, uidFromItemPath } from './itemFile';

/**
 * One-click task checkboxes (spec 035): a mouse click strictly inside the
 * brackets of `- [ ]` / `- [x]` in an item's text flips it as an ordinary,
 * undoable edit. Pure text scan, no server; saving stays with the user.
 */

const TASK_REGEX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?:\s|$)/;
const FENCE_REGEX = /^\s*(?:```|~~~)/;

type TextKind = 'yaml' | 'markdown' | 'view';

/** Column of the task's `[`, or undefined when the line is no task. */
export function taskBoxAt(lineText: string): number | undefined {
  return TASK_REGEX.exec(lineText)?.[1].length;
}

function inFence(lines: string[], start: number, line: number): boolean {
  let open = false;
  for (let index = start; index < line; index++) {
    if (FENCE_REGEX.test(lines[index])) {
      open = !open;
    }
  }
  return open;
}

/** The one-character range between the brackets a click at `character` hits, if any. */
export function toggleTargetAt(lines: string[], line: number, character: number, kind: TextKind): vscode.Range | undefined {
  let start = 0;
  if (kind === 'view') {
    if (!itemBodyAt(parse(lines.join('\n')), line)) {
      return undefined;
    }
  } else {
    const range = textRange(lines, kind === 'markdown');
    if (!range || line < range.start || line >= range.end) {
      return undefined;
    }
    start = range.start;
  }
  const box = taskBoxAt(lines[line]);
  if (box === undefined || (character !== box + 1 && character !== box + 2) || inFence(lines, start, line)) {
    return undefined;
  }
  return new vscode.Range(line, box + 1, line, box + 2);
}

function textKind(document: vscode.TextDocument): TextKind | undefined {
  if (isViewUri(document.uri)) {
    return 'view';
  }
  if (document.uri.scheme !== 'file' || !uidFromItemPath(document.fileName) || !inDoorstopDocument(document.fileName)) {
    return undefined;
  }
  return document.fileName.toLowerCase().endsWith('.md') ? 'markdown' : 'yaml';
}

export async function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
  const document = event.textEditor.document;
  const [selection, ...more] = event.selections;
  const kind = textKind(document);
  if (event.kind !== vscode.TextEditorSelectionChangeKind.Mouse || more.length > 0 || !selection?.isEmpty || !kind) {
    return;
  }
  const target = toggleTargetAt(document.getText().split(/\r?\n/), selection.active.line, selection.active.character, kind);
  if (!target) {
    return;
  }
  const next = document.getText(target) === ' ' ? 'x' : ' ';
  // A read-only editor (diff view) rejects the edit; there is nothing to report.
  await Promise.resolve(event.textEditor.edit(builder => builder.replace(target, next))).catch(() => undefined);
}

export function registerTaskToggle(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => void handleSelectionChange(event)));
}
