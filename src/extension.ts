import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface DoorstopItem {
  text?: string;
  header?: string;
  level?: string;
  active?: boolean;
  derived?: boolean;
  normative?: boolean;
  links?: (string | Record<string, string | null>)[];
  ref?: string;
}

function parseDoorstopFile(rawContent: string): DoorstopItem | undefined {
  const trimmed = rawContent.trimStart();

  if (trimmed.startsWith('---')) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = trimmed.match(frontmatterRegex);

    if (match) {
      const yamlHeader = match[1];
      const markdownBody = match[2];
      const item = (yaml.load(yamlHeader) as DoorstopItem) || {};
      
      if (!item.text && markdownBody.trim().length > 0) {
        item.text = markdownBody.trim();
      }
      return item;
    }
  }

  return yaml.load(rawContent) as DoorstopItem;
}

/**
 * Creates a VS Code Command URI link that opens the target item file when clicked.
 */
async function makeClickableLink(uid: string): Promise<string> {
  const files = await vscode.workspace.findFiles(`**/${uid}.{yml,md}`, '**/node_modules/**', 1);
  if (files.length === 0) {
    return `\`${uid}\``; // Fallback to plain text if file is missing
  }

  const fileUri = files[0];
  const args = encodeURIComponent(JSON.stringify([fileUri.toString()]));
  const commandUri = `command:vscode.open?${args}`;

  return `[${uid}](${commandUri})`;
}

/**
 * Formats Doorstop link arrays into clickable Markdown links.
 */
async function formatLinksClickable(links: (string | Record<string, string | null>)[]): Promise<string> {
  const formattedLinks: string[] = [];

  for (const link of links) {
    if (typeof link === 'string') {
      formattedLinks.push(await makeClickableLink(link));
    } else if (typeof link === 'object' && link !== null) {
      for (const key of Object.keys(link)) {
        formattedLinks.push(await makeClickableLink(key));
      }
    }
  }

  return formattedLinks.join(', ');
}

async function findReverseLinks(targetUid: string): Promise<string[]> {
  const allFiles = await vscode.workspace.findFiles('**/*.{yml,md}', '**/node_modules/**');
  const reverseLinks: string[] = [];

  for (const file of allFiles) {
    const fileName = path.basename(file.fsPath);
    const itemUid = fileName.replace(/\.(yml|md)$/, '');

    if (itemUid === targetUid) {
      continue;
    }

    try {
      const fileData = await vscode.workspace.fs.readFile(file);
      const rawContent = new TextDecoder().decode(fileData);
      const item = parseDoorstopFile(rawContent);

      if (item && item.links) {
        const hasLink = item.links.some(link => {
          if (typeof link === 'string') {
            return link === targetUid;
          }
          if (typeof link === 'object' && link !== null) {
            return Object.keys(link).includes(targetUid);
          }
          return false;
        });

        if (hasLink) {
          reverseLinks.push(itemUid);
        }
      }
    } catch {
      // Ignore unparseable files
    }
  }

  return reverseLinks;
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Doorstop VS Code Extension is active!');

  const uidRegex = /\b[A-Z0-9_-]+-\d+\b/g;

  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    async provideHover(document: vscode.TextDocument, position: vscode.Position) {
      const lineText = document.lineAt(position.line).text;
      const currentFileName = path.basename(document.fileName);
      const currentFileUid = currentFileName.replace(/\.(yml|md)$/, '');

      // 1. Hover over "derived:" line -> Downstream (reverse) links for current file
      const isDerivedHover = /^\s*derived\s*:/i.test(lineText);

      if (isDerivedHover) {
        const range = document.lineAt(position.line).range;
        const reverseLinkUids = await findReverseLinks(currentFileUid);

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        markdown.appendMarkdown(`### 🔗 **Downstream (Reverse) Links for ${currentFileUid}**\n\n---\n\n`);

        if (reverseLinkUids.length > 0) {
          const clickableReverseLinks = await Promise.all(
            reverseLinkUids.map(uid => makeClickableLink(uid))
          );
          markdown.appendMarkdown(clickableReverseLinks.join(', '));
        } else {
          markdown.appendMarkdown('*No items link to this requirement.*');
        }

        return new vscode.Hover(markdown, range);
      }

      // 2. Extract Hovered UID
      const range = document.getWordRangeAtPosition(position, uidRegex);
      if (!range) {
        return undefined;
      }

      const hoveredUid = document.getText(range);

      // Check if the current line is inside a `links:` block or list (e.g. "- SYS-0001: null")
      const isInsideLinksBlock = /^\s*(-|\s)\s*[A-Z0-9_-]+-\d+/i.test(lineText) || /^\s*links\s*:/i.test(lineText);

      const files = await vscode.workspace.findFiles(`**/${hoveredUid}.{yml,md}`, '**/node_modules/**', 1);
      if (files.length === 0) {
        return undefined;
      }

      try {
        const fileData = await vscode.workspace.fs.readFile(files[0]);
        const rawContent = new TextDecoder().decode(fileData);
        const item = parseDoorstopFile(rawContent);

        if (!item) {
          return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // Open Link Header
        const targetFileLink = await makeClickableLink(hoveredUid);
        markdown.appendMarkdown(`### 📋 **Target Item:** ${targetFileLink}\n\n`);

        if (item.header) {
          markdown.appendMarkdown(`**Header:** ${item.header}\n\n`);
        }
        if (item.level) {
          markdown.appendMarkdown(`**Level:** ${item.level}\n\n`);
        }
        markdown.appendMarkdown(`---\n\n`);

        // Text
        if (item.text) { 
          markdown.appendMarkdown(`${item.text.trim()}\n\n`);
        } else {
          markdown.appendMarkdown('*No requirement text defined.*\n\n');
        }

        // Only show upstream links if NOT hovering directly on a link item
        if (!isInsideLinksBlock && item.links && item.links.length > 0) {
          const formattedClickableLinks = await formatLinksClickable(item.links);
          markdown.appendMarkdown(`**Upstream Links:** ${formattedClickableLinks}\n\n`);
        }
 
        if (item.ref) {
          markdown.appendMarkdown(`**Ref:** \`${item.ref}\``);
        }

        return new vscode.Hover(markdown, range);

      } catch (error) {
        console.error(`Error parsing Doorstop file for ${hoveredUid}:`, error);
        return undefined;
      }
    }
  });

  context.subscriptions.push(hoverProvider);
}

export function deactivate() {}