import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface RequirementSuggestion {
  uid: string;
  title: string;
  uri: vscode.Uri;
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

function parseRequirement(rawContent: string): { title: string } {
  const trimmed = rawContent.trimStart();
  let yamlContent = rawContent;
  let markdownBody = '';

  if (trimmed.startsWith('---')) {
    const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
      yamlContent = match[1];
      markdownBody = match[2];
    }
  }

  const data = (yaml.load(yamlContent) as { header?: string } | null) || {};
  if (data.header) {
    return { title: data.header };
  }

  const heading = markdownBody.match(/^#\s+(.+)$/m);
  if (heading) {
    return { title: heading[1].trim() };
  }

  return { title: markdownBody.trim().split('\n')[0]?.trim() || 'Unnamed requirement' };
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

export function registerCompletionProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      if (!isInLinksBlock(document, position)) {
        return undefined;
      }

      const range = getReplacementRange(document, position);
      if (!range) {
        return undefined;
      }

      const files = await vscode.workspace.findFiles('**/*.{yml,md}', '**/{node_modules,.git,out,dist,.venv,venv}/**');
      const suggestions: RequirementSuggestion[] = [];
      const seen = new Set<string>();

      for (const uri of files) {
        const uid = path.basename(uri.fsPath).replace(/\.(yml|md)$/, '');
        if (!uid || seen.has(uid)) {
          continue;
        }

        try {
          const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
          const requirement = parseRequirement(content);
          seen.add(uid);
          suggestions.push({ uid, title: requirement.title, uri });
        } catch {
          // Ignore files that cannot be read or parsed.
        }
      }

      const recentIndex = (uid: string): number => {
        const index = recentlyViewedUids.indexOf(uid);
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
      };
      suggestions.sort((a, b) => recentIndex(a.uid) - recentIndex(b.uid)
        || a.uid.localeCompare(b.uid));

      return suggestions.map(suggestion => {
        const item = new vscode.CompletionItem(
          `${suggestion.uid} - ${suggestion.title}`,
          vscode.CompletionItemKind.Reference
        );
        item.detail = suggestion.uri.fsPath;
        item.documentation = new vscode.MarkdownString(`**${suggestion.uid}**\n\n${suggestion.title}`);
        item.insertText = `${suggestion.uid}: null`;
        item.range = range;
        const viewedIndex = recentlyViewedUids.indexOf(suggestion.uid);
        const sortRank = viewedIndex >= 0 ? viewedIndex : recentlyViewedUids.length + 1;
        item.sortText = `${String(sortRank).padStart(6, '0')}_${suggestion.uid}`;
        item.filterText = `${suggestion.uid} ${suggestion.title}`;
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
