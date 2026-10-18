import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { getMetadataLineRange } from './reviewLensProvider';
import { registerCommand } from './timing';

const SETTING = 'foldYamlHeaderOnOpen';

/**
 * A `.md` file in a Doorstop document folder (or a subfolder of one). Checked on
 * disk so folding works without the server (spec 034 FR-009).
 */
// ponytail: any .md under a document folder counts, also non-item notes; ask the server's item list when it is up if that matters
function isDoorstopItem(fsPath: string): boolean {
  if (path.extname(fsPath).toLowerCase() !== '.md') {
    return false;
  }
  for (let dir = path.dirname(fsPath); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.doorstop.yml'))) {
      return true;
    }
    if (path.dirname(dir) === dir) {
      return false;
    }
  }
}

/**
 * One fold over the YAML header of Markdown items (spec 034). VS Code does the
 * folding on open: the range is an Imports range while the setting is on, and
 * `[markdown] editor.foldingImportsByDefault` (package.json) folds those in every
 * editor, peek editors included (research R1).
 */
export function registerHeaderFolding(context: vscode.ExtensionContext): void {
  const changed = new vscode.EventEmitter<void>();
  const provider: vscode.FoldingRangeProvider = {
    onDidChangeFoldingRanges: changed.event,
    provideFoldingRanges(document) {
      if (!isDoorstopItem(document.uri.fsPath)) {
        return [];
      }
      const range = getMetadataLineRange(document, document.getText().split(/\r?\n/));
      if (!range || range.end < 2) {
        return [];
      }
      const foldOnOpen = vscode.workspace.getConfiguration('doorstop').get<boolean>(SETTING, false);
      return [new vscode.FoldingRange(0, range.end, foldOnOpen ? vscode.FoldingRangeKind.Imports : undefined)];
    }
  };
  const setFoldOnOpen = (value: boolean) => vscode.workspace.getConfiguration('doorstop').update(
    SETTING,
    value,
    vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global
  );
  context.subscriptions.push(
    changed,
    vscode.languages.registerFoldingRangeProvider({ language: 'markdown', scheme: 'file' }, provider),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(`doorstop.${SETTING}`)) {
        changed.fire();
      }
    }),
    registerCommand('doorstop.foldYamlHeaderOnOpen.on', () => setFoldOnOpen(true)),
    registerCommand('doorstop.foldYamlHeaderOnOpen.off', () => setFoldOnOpen(false))
  );
}
