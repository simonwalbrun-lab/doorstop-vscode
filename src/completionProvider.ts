import * as path from 'node:path';
import * as vscode from 'vscode';

import { getItemTitle, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';

/**
 * UID autocompletion inside a requirement's `links:` block.
 *
 * The candidate list comes from `GET /tree` via the shared DoorstopIndex, so the
 * suggestions are exactly the items Doorstop itself knows about - a stray
 * `notes.yml` sitting next to the requirements is no longer offered as a link
 * target. See src/doorstopIndex.ts.
 */

export interface CompletionProviderOptions {
  server: DoorstopServer;
}

const recentlyViewedUids: string[] = [];

export function recordViewedRequirement(uri: vscode.Uri | undefined): void {
  if (!uri || !['yml', 'md'].includes(path.extname(uri.fsPath).slice(1).toLowerCase())) {
    return;
  }

  const uid = path.basename(uri.fsPath).replace(/\.(yml|md)$/, '');
  const existingIndex = recentlyViewedUids.indexOf(uid);
  if (existingIndex >= 0) {
    recentlyViewedUids.splice(existingIndex, 1);
  }
  recentlyViewedUids.unshift(uid);
}

function isInsideFrontmatter(document: vscode.TextDocument, line: number): boolean {
  let delimiterCount = 0;
  for (let index = 0; index <= line; index++) {
    if (/^\s*---\s*$/.test(document.lineAt(index).text)) {
      delimiterCount++;
    }
  }
  return delimiterCount === 1;
}

function isInLinksBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
  if (document.languageId === 'markdown' && !isInsideFrontmatter(document, position.line)) {
    return false;
  }

  for (let line = position.line; line >= 0; line--) {
    const text = document.lineAt(line).text;
    if (/^\s*links\s*:/i.test(text)) {
      return true;
    }
    if (/^\s*[A-Za-z][\w-]*\s*:/.test(text) && !/^\s*-/.test(text)) {
      return false;
    }
  }
  return false;
}

function getReplacementRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  const line = document.lineAt(position.line).text.slice(0, position.character);
  const match = line.match(/^(\s*-\s*)([^\s:]*)$/);
  if (!match) {
    return undefined;
  }

  const start = position.character - match[2].length;
  return new vscode.Range(position.line, start, position.line, position.character);
}

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  options: CompletionProviderOptions
): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      if (!isInLinksBlock(document, position)) {
        return undefined;
      }

      const range = getReplacementRange(document, position);
      if (!range) {
        return undefined;
      }

      const index = await loadDoorstopIndex(options.server);
      if (!index) {
        return undefined;
      }

      const recentIndex = (uid: string): number => {
        const position = recentlyViewedUids.indexOf(uid);
        return position >= 0 ? position : Number.MAX_SAFE_INTEGER;
      };
      const suggestions = index.items.sort((a, b) => recentIndex(a.uid) - recentIndex(b.uid)
        || a.uid.localeCompare(b.uid));

      return suggestions.map(suggestion => {
        const title = getItemTitle(suggestion);
        const item = new vscode.CompletionItem(
          `${suggestion.uid} - ${title}`,
          vscode.CompletionItemKind.Reference
        );
        item.detail = suggestion.path;
        item.documentation = new vscode.MarkdownString(`**${suggestion.uid}**\n\n${title}`);
        item.insertText = `${suggestion.uid}: null`;
        item.range = range;
        const viewedIndex = recentlyViewedUids.indexOf(suggestion.uid);
        const sortRank = viewedIndex >= 0 ? viewedIndex : recentlyViewedUids.length + 1;
        item.sortText = `${String(sortRank).padStart(6, '0')}_${suggestion.uid}`;
        item.filterText = `${suggestion.uid} ${title}`;
        return item;
      });
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [{ language: 'yaml' }, { language: 'markdown' }],
      provider,
      '-', '_'
    )
  );
}
