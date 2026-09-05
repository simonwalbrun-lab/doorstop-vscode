import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface DoorstopItem {
  text?: string;
  header?: string;
  level?: string;
  links?: (string | Record<string, string | null>)[];
  ref?: string;
}

function parseDoorstopFile(rawContent: string): DoorstopItem | undefined {
  const trimmed = rawContent.trimStart();
  if (trimmed.startsWith('---')) {
    const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (match) {
      const item = (yaml.load(match[1]) as DoorstopItem) || {};
      if (!item.text && match[2].trim().length > 0) {
        item.text = match[2].trim();
      }
      return item;
    }
  }
  return yaml.load(rawContent) as DoorstopItem;
}

async function makeClickableLink(uid: string): Promise<string> {
  const files = await vscode.workspace.findFiles(`**/${uid}.{yml,md}`, '**/node_modules/**', 1);
  if (files.length === 0) {
    return `\`${uid}\``;
  }
  const args = encodeURIComponent(JSON.stringify([files[0].toString()]));
  return `[${uid}](command:vscode.open?${args})`;
}

async function formatLinksClickable(links: (string | Record<string, string | null>)[]): Promise<string> {
  const formattedLinks: string[] = [];
  for (const link of links) {
    if (typeof link === 'string') {
      formattedLinks.push(await makeClickableLink(link));
    } else if (link !== null) {
      for (const key of Object.keys(link)) {
        formattedLinks.push(await makeClickableLink(key));
      }
    }
  }
  return formattedLinks.join(', ');
}

async function findReverseLinks(targetUid: string): Promise<string[]> {
  const allFiles = await vscode.workspace.findFiles('**/*.{yml,md}', '**/node_modules/**');
  const reverseLinkUids: string[] = [];
  for (const file of allFiles) {
    const itemUid = path.basename(file.fsPath).replace(/\.(yml|md)$/, '');
    if (itemUid === targetUid) continue;
    try {
      const rawContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
      const item = parseDoorstopFile(rawContent);
      if (item?.links?.some(link => typeof link === 'string'
        ? link === targetUid
        : link !== null && Object.keys(link).includes(targetUid))) {
        reverseLinkUids.push(itemUid);
      }
    } catch {
      // Ignore unparseable files.
    }
  }
  return reverseLinkUids;
}

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  const uidRegex = /\b[A-Z0-9_-]+-\d+\b/g;
  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    async provideHover(document, position) {
      const lineText = document.lineAt(position.line).text;
      const currentFileUid = path.basename(document.fileName).replace(/\.(yml|md)$/, '');
      if (/^\s*derived\s*:/i.test(lineText)) {
        const range = document.lineAt(position.line).range;
        const reverseLinkUids = await findReverseLinks(currentFileUid);
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendMarkdown(`### 🔗 **Downstream (Reverse) Links for ${currentFileUid}**\n\n---\n\n`);
        if (reverseLinkUids.length > 0) {
          markdown.appendMarkdown((await Promise.all(reverseLinkUids.map(makeClickableLink))).join(', '));
        } else {
          markdown.appendMarkdown('*No items link to this requirement.*');
        }
        return new vscode.Hover(markdown, range);
      }

      const range = document.getWordRangeAtPosition(position, uidRegex);
      if (!range) return undefined;
      const hoveredUid = document.getText(range);
      const isInsideLinksBlock = /^\s*(-|\s)\s*[A-Z0-9_-]+-\d+/i.test(lineText)
        || /^\s*links\s*:/i.test(lineText);
      const files = await vscode.workspace.findFiles(`**/${hoveredUid}.{yml,md}`, '**/node_modules/**', 1);
      if (files.length === 0) return undefined;

      try {
        const rawContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(files[0]));
        const item = parseDoorstopFile(rawContent);
        if (!item) return undefined;
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendMarkdown(`### 📋 **Target Item:** ${await makeClickableLink(hoveredUid)}\n\n`);
        if (item.header) markdown.appendMarkdown(`**Header:** ${item.header}\n\n`);
        if (item.level) markdown.appendMarkdown(`**Level:** ${item.level}\n\n`);
        markdown.appendMarkdown('---\n\n');
        markdown.appendMarkdown(item.text ? `${item.text.trim()}\n\n` : '*No requirement text defined.*\n\n');
        if (!isInsideLinksBlock && item.links?.length) {
          markdown.appendMarkdown(`**Upstream Links:** ${await formatLinksClickable(item.links)}\n\n`);
        }
        if (item.ref) markdown.appendMarkdown(`**Ref:** \`${item.ref}\``);
        return new vscode.Hover(markdown, range);
      } catch (error) {
        console.error(`[Doorstop][hover] Failed to parse ${hoveredUid}:`, error);
        return undefined;
      }
    }
  });
  context.subscriptions.push(hoverProvider);
}
