import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

// Interface matching standard Doorstop attributes across YAML and Markdown formats
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

/**
 * Parses Doorstop files in both standard YAML format and YAML frontmatter + Markdown format.
 */
function parseDoorstopFile(rawContent: string): DoorstopItem | undefined {
  const trimmed = rawContent.trimStart();

  // Handle Markdown files with YAML Frontmatter (starts with ---)
  if (trimmed.startsWith('---')) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = trimmed.match(frontmatterRegex);

    if (match) {
      const yamlHeader = match[1];
      const markdownBody = match[2];

      const item = (yaml.load(yamlHeader) as DoorstopItem) || {};
      
      // In Doorstop Markdown format, requirement text lives in the body section
      if (!item.text && markdownBody.trim().length > 0) {
        item.text = markdownBody.trim();
      }

      return item;
    }
  }

  // Fallback to standard pure YAML file
  return yaml.load(rawContent) as DoorstopItem;
}

/**
 * Formats Doorstop link arrays (handling plain strings or link fingerprint maps)
 */
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

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Doorstop VS Code Extension is active!');

  // Regex pattern matching common Doorstop UIDs (e.g., REQ-0001, SYS-0002)
  const uidRegex = /\b[A-Z0-9_-]+-\d+\b/g;

  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    async provideHover(document: vscode.TextDocument, position: vscode.Position) {
      const range = document.getWordRangeAtPosition(position, uidRegex);
      if (!range) {
        return undefined;
      }

      const hoveredUid = document.getText(range);

      // Search for either .yml or .md files matching the target UID
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

        // Title and optional Header/Level info
        let headerText = `### 📋 **${hoveredUid}**`;
        if (item.header) {
          headerText += `: ${item.header}`;
        }
        if (item.level) {
          headerText += ` *(Level: ${item.level})*`;
        }
        markdown.appendMarkdown(`${headerText}\n\n---\n\n`);

        // Requirement Text
        if (item.text) {
          markdown.appendMarkdown(`${item.text.trim()}\n\n`);
        } else {
          markdown.appendMarkdown('*No requirement text defined.*\n\n');
        }

        // Parent/Upstream Links
        if (item.links && item.links.length > 0) {
          markdown.appendMarkdown(`**Links:** ${formatLinks(item.links)}\n\n`);
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