import * as vscode from 'vscode';

import { DoorstopIndex, getDocumentUid, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';
import { DOCUMENT_VIEW_SCHEME } from './documentViewModel';

/**
 * Hover previews for requirement UIDs.
 *
 * All item data comes from `GET /tree` via the shared DoorstopIndex - this
 * provider never reads or parses a requirement file itself. See
 * src/doorstopIndex.ts for why, and specs/013-review-suspect-codelenses/research.md
 * section 5.
 */

const UID_REGEX = /\b[A-Z0-9_-]+-\d+\b/g;
const DERIVED_LINE_REGEX = /^\s*derived\s*:/i;
const LINK_ENTRY_LINE_REGEX = /^\s*(-|\s)\s*[A-Z0-9_-]+-\d+/i;
const LINKS_FIELD_LINE_REGEX = /^\s*links\s*:/i;

export interface HoverProviderOptions {
  server: DoorstopServer;
}

/** A UID rendered as a link to the file the *server* says it lives in. */
function makeClickableLink(uid: string, index: DoorstopIndex): string {
  const uri = index.getUri(uid);
  if (!uri) {
    return `\`${uid}\``;
  }
  const args = encodeURIComponent(JSON.stringify([uri.toString()]));
  return `[${uid}](command:vscode.open?${args})`;
}

function formatLinksClickable(uids: string[], index: DoorstopIndex): string {
  return uids.map(uid => makeClickableLink(uid, index)).join(', ');
}

/** The markdown shown when hovering a `derived:` line: what links *to* this item. */
function renderReverseLinks(currentUid: string, index: DoorstopIndex): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`### 🔗 **Downstream (Reverse) Links for ${currentUid}**\n\n---\n\n`);
  const linkers = index.getLinkers(currentUid);
  markdown.appendMarkdown(linkers.length > 0
    ? formatLinksClickable(linkers, index)
    : '*No items link to this requirement.*');
  return markdown;
}

function renderItemPreview(
  hoveredUid: string,
  index: DoorstopIndex,
  showUpstreamLinks: boolean
): vscode.MarkdownString | undefined {
  const item = index.getItem(hoveredUid);
  if (!item) {
    return undefined;
  }

  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`### 📋 **Target Item:** ${makeClickableLink(hoveredUid, index)}\n\n`);
  if (item.header) {
    markdown.appendMarkdown(`**Header:** ${item.header}\n\n`);
  }
  if (item.level) {
    markdown.appendMarkdown(`**Level:** ${item.level}\n\n`);
  }
  markdown.appendMarkdown('---\n\n');
  markdown.appendMarkdown(item.text?.trim()
    ? `${item.text.trim()}\n\n`
    : '*No requirement text defined.*\n\n');
  if (showUpstreamLinks && item.links.length > 0) {
    markdown.appendMarkdown(`**Upstream Links:** ${formatLinksClickable(item.links.map(link => link.uid), index)}\n\n`);
  }
  if (item.ref) {
    markdown.appendMarkdown(`**Ref:** \`${item.ref}\``);
  }
  return markdown;
}

export function registerHoverProvider(
  context: vscode.ExtensionContext,
  options: HoverProviderOptions
): void {
  // Also the Document View (spec 019): its separators carry item UIDs.
  const hoverProvider = vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: DOCUMENT_VIEW_SCHEME }], {
    async provideHover(document, position) {
      const lineText = document.lineAt(position.line).text;
      const isDerivedLine = DERIVED_LINE_REGEX.test(lineText);
      const range = isDerivedLine
        ? document.lineAt(position.line).range
        : document.getWordRangeAtPosition(position, UID_REGEX);
      if (!range) {
        return undefined;
      }

      // Only pay for the tree request once the position is known to be hoverable.
      const index = await loadDoorstopIndex(options.server);
      if (!index) {
        return undefined;
      }

      if (isDerivedLine) {
        const currentUid = getDocumentUid(document, index);
        return currentUid
          ? new vscode.Hover(renderReverseLinks(currentUid, index), range)
          : undefined;
      }

      // Inside a `links:` block the upstream list would just restate the
      // surrounding lines, so it is left out there.
      const isInsideLinksBlock = LINK_ENTRY_LINE_REGEX.test(lineText)
        || LINKS_FIELD_LINE_REGEX.test(lineText);
      const markdown = renderItemPreview(document.getText(range), index, !isInsideLinksBlock);
      return markdown ? new vscode.Hover(markdown, range) : undefined;
    }
  });
  context.subscriptions.push(hoverProvider);
}
