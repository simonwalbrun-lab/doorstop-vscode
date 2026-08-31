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

function formatLinks(links: (string | Record<string, string | null>)[]): string {
  return links
    .map(link => {
      if (typeof link === 'string') {
        return `\`${link}\``;
      }
      if (typeof link === 'object' && link !== null) {
        return Object.keys(link).map(k => `\`${k}\``).join(', ');
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');
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
      
      // Get the current file's UID from its filename (e.g. REQ-0001.yml -> REQ-0001)
      const currentFileName = path.basename(document.fileName);
      const currentFileUid = currentFileName.replace(/\.(yml|md)$/, '');

      // Check if hovering specifically over line containing "derived:"
      const isDerivedHover = /^\s*derived\s*:/i.test(lineText);

      if (isDerivedHover) {
        const range = document.lineAt(position.line).range;
        const reverseLinks = await findReverseLinks(currentFileUid);

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        markdown.appendMarkdown(`### 🔗 **Downstream (Reverse) Links for ${currentFileUid}**\n\n---\n\n`);

        if (reverseLinks.length > 0) {
          markdown.appendMarkdown(reverseLinks.map(l => `\`${l}\``).join(', '));
        } else {
          markdown.appendMarkdown('*No items link to this requirement.*');
        }

        return new vscode.Hover(markdown, range);
      }

      // Standard UID Hover (does NOT show downstream/reverse links)
      const range = document.getWordRangeAtPosition(position, uidRegex);
      if (!range) {
        return undefined;
      }

      const hoveredUid = document.getText(range);
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

        let headerText = `### 📋 **${hoveredUid}**`;
        if (item.header) {
          headerText += `: ${item.header}`;
        }
        if (item.level) {
          headerText += ` *(Level: ${item.level})*`;
        }
        markdown.appendMarkdown(`${headerText}\n\n---\n\n`);

        if (item.text) {
          markdown.appendMarkdown(`${item.text.trim()}\n\n`);
        } else {
          markdown.appendMarkdown('*No requirement text defined.*\n\n');
        }

        if (item.links && item.links.length > 0) {
          markdown.appendMarkdown(`**Upstream Links:** ${formatLinks(item.links)}\n\n`);
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