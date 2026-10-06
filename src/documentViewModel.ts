import * as vscode from 'vscode';

import { DocumentNode, ItemNode } from './doorstopTypes';
import { levelDepth } from './requirementTree';

/**
 * The pure text model of the Document View (spec 019): how one Doorstop
 * document is rendered as a single markdown text, how that text is split back
 * into item blocks, and how the blocks are diffed against the server's snapshot
 * into a save plan.
 *
 * Nothing in here touches VS Code state, the network or the file system. Every
 * fact about an item (header, text, level, order) comes from `GET /tree`; the
 * grammar below is the view's own and has no Doorstop equivalent. See
 * specs/019-document-view/contracts/document-view-format.md for the contract
 * these functions implement, and data-model.md for the shapes.
 */

export const DOCUMENT_VIEW_SCHEME = 'doorstop-document';
/** Same interval problemsProvider.ts uses, so the two never race visibly. */
export const DEBOUNCE_MS = 300;
export const PLACEHOLDER_MARKER = '<!-- new item -->';

/** U+00B7 MIDDLE DOT, the field separator inside managed lines. */
const DOT = ' · ';

export function documentMarker(prefix: string): string {
  return `<!-- doorstop document ${prefix}${DOT}keep this line -->`;
}

export function itemSeparator(uid: string, level: string): string {
  return `<!-- ${uid}${DOT}${level}${DOT}item separator. keep this line -->`;
}

// Anchored on the whole line: any deviation makes the line "changed", never a
// looser match. UIDs are validated against the snapshot, so the token class is
// deliberately wide (Doorstop allows UIDs without a separator, e.g. REQ001).
export const DOCUMENT_MARKER_REGEX = /^<!-- doorstop document (?<prefix>[A-Za-z0-9_-]+) · keep this line -->$/;
export const ITEM_SEPARATOR_REGEX = /^<!-- (?<uid>[A-Za-z0-9_.-]+) · (?<level>\d+(?:\.\d+)*) · item separator\. keep this line -->$/;
export const PLACEHOLDER_REGEX = /^<!-- new item -->$/;
const HEADING_LINE_REGEX = /^#{1,6}\s+\S/;
const HEADING_PREFIX_REGEX = /^#{1,6}\s+/;

export function viewUriFor(prefix: string): vscode.Uri {
  return vscode.Uri.from({ scheme: DOCUMENT_VIEW_SCHEME, path: `/${prefix} (document)` });
}

/** The prefix a view URI stands for, or undefined for any other URI. */
export function prefixFromViewUri(uri: vscode.Uri): string | undefined {
  if (uri.scheme !== DOCUMENT_VIEW_SCHEME) {
    return undefined;
  }
  const match = /^\/(.+) \(document\)$/.exec(uri.path);
  return match ? match[1] : undefined;
}

export function isViewUri(uri: vscode.Uri): boolean {
  return uri.scheme === DOCUMENT_VIEW_SCHEME;
}

/**
 * Doorstop's own `Text.load_text` normalisation: right-trim every line, drop
 * leading and trailing blank lines. Applied to both sides of every comparison
 * so a blank line more or less never counts as a change.
 */
export function normalizeText(text: string | string[]): string {
  const lines = (Array.isArray(text) ? text : text.split(/\r?\n/)).map(line => line.replace(/\s+$/, ''));
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') {
    start++;
  }
  while (end > start && lines[end - 1] === '') {
    end--;
  }
  return lines.slice(start, end).join('\n');
}

/** Heading text without its `#` prefix; a non-heading line yields its trimmed text. */
export function normalizeHeader(line: string): string {
  return line.replace(HEADING_PREFIX_REGEX, '').trim();
}

/** Markdown heading depth for a level: `1.0` -> 1, `1.1` -> 2, `1.1.1` -> 3, capped at 6. */
export function headingDepth(level: string): number {
  return Math.min(6, Math.max(1, levelDepth(level)));
}

export function headerLineFor(item: Pick<ItemNode, 'uid' | 'level' | 'header'>): string {
  return `${'#'.repeat(headingDepth(item.level))} ${item.header?.trim() || item.uid}`;
}

export type StructuralCode =
  | 'text-before-first-separator'
  | 'separator-duplicated'
  | 'separator-unknown'
  | 'separator-lookalike'
  | 'separator-changed'
  | 'missing-header'
  | 'placeholder-empty-heading';

export interface StructuralIssue {
  code: StructuralCode;
  severity: 'error' | 'warning';
  /** 0-based line the issue is anchored to. */
  line: number;
  uid?: string;
  message: string;
}

export interface RenderedBlock {
  kind: 'document' | 'item';
  uid?: string;
  level?: string;
  separator: string;
  headerLine?: string;
  textLines: string[];
  startLine: number;
  endLine: number;
}

export interface RenderResult {
  text: string;
  blocks: RenderedBlock[];
  issues: StructuralIssue[];
}

function isManagedLine(line: string): boolean {
  return ITEM_SEPARATOR_REGEX.test(line) || PLACEHOLDER_REGEX.test(line) || DOCUMENT_MARKER_REGEX.test(line);
}

/** The view text for a document snapshot (contract: "Rendering"). */
export function render(document: DocumentNode): RenderResult {
  const lines: string[] = [documentMarker(document.prefix)];
  const blocks: RenderedBlock[] = [{
    kind: 'document',
    separator: lines[0],
    textLines: [],
    startLine: 0,
    endLine: 0
  }];
  const issues: StructuralIssue[] = [];

  for (const item of document.items) {
    if (!item.active) {
      continue;
    }
    lines.push('');
    const startLine = lines.length;
    const separator = itemSeparator(item.uid, item.level);
    const headerLine = headerLineFor(item);
    lines.push(separator, headerLine);
    // A heading item (non-normative, header, no text) simply has no text lines;
    // no special case is needed, and an item with text always shows it.
    const textLines = item.text ? item.text.split(/\r?\n/) : [];
    for (const textLine of textLines) {
      if (isManagedLine(textLine)) {
        issues.push({
          code: 'separator-lookalike',
          severity: 'error',
          line: lines.length,
          uid: item.uid,
          message: `A line of ${item.uid}'s text looks like a Doorstop separator - edit this item in its own file`
        });
      }
      lines.push(textLine);
    }
    blocks.push({
      kind: 'item',
      uid: item.uid,
      level: item.level,
      separator,
      headerLine,
      textLines,
      startLine,
      endLine: lines.length - 1
    });
  }

  return { text: lines.join('\n') + '\n', blocks, issues };
}

export interface ParsedBlock {
  kind: 'document' | 'item' | 'placeholder' | 'orphan';
  uid?: string;
  level?: string;
  /** 0-based line of the managed line (first non-blank line for `orphan`). */
  separatorLine: number;
  separatorText: string;
  /** Line of the header line, when the block has one. */
  headerLine?: number;
  /** Header text with `#`s stripped; `''` when the line is blank or absent. */
  headerText: string;
  headerLineIsHeading: boolean;
  /** Normalised body (contract: parsing rule 5). */
  text: string;
  /** Last non-blank line of the block (>= separatorLine). */
  endLine: number;
}

function lastNonBlank(lines: string[], from: number, toExclusive: number): number {
  for (let line = toExclusive - 1; line >= from; line--) {
    if (lines[line].trim() !== '') {
      return line;
    }
  }
  return from;
}

/** Splits view text into blocks at the managed lines (contract: "Parsing"). */
export function parse(text: string): ParsedBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];

  const managed: number[] = [];
  for (let line = 0; line < lines.length; line++) {
    if (isManagedLine(lines[line])) {
      managed.push(line);
    }
  }

  const firstManaged = managed.length > 0 ? managed[0] : lines.length;
  // Anything non-blank before the first managed line has no block to belong to.
  const firstText = lines.slice(0, firstManaged).findIndex(line => line.trim() !== '');
  if (firstText >= 0) {
    blocks.push({
      kind: 'orphan',
      separatorLine: firstText,
      separatorText: lines[firstText],
      headerText: '',
      headerLineIsHeading: false,
      text: normalizeText(lines.slice(firstText, firstManaged)),
      endLine: lastNonBlank(lines, firstText, firstManaged)
    });
  }

  for (let index = 0; index < managed.length; index++) {
    const start = managed[index];
    const end = index + 1 < managed.length ? managed[index + 1] : lines.length;
    const separatorText = lines[start];
    const endLine = lastNonBlank(lines, start, end);

    if (DOCUMENT_MARKER_REGEX.test(separatorText)) {
      const body = lines.slice(start + 1, end);
      blocks.push({
        kind: 'document',
        separatorLine: start,
        separatorText,
        headerText: '',
        headerLineIsHeading: false,
        text: normalizeText(body),
        endLine
      });
      // Text under the document marker belongs to nobody: report it as an orphan.
      const orphanAt = body.findIndex(line => line.trim() !== '');
      if (orphanAt >= 0) {
        blocks.push({
          kind: 'orphan',
          separatorLine: start + 1 + orphanAt,
          separatorText: body[orphanAt],
          headerText: '',
          headerLineIsHeading: false,
          text: normalizeText(body),
          endLine
        });
      }
      continue;
    }

    const separatorMatch = ITEM_SEPARATOR_REGEX.exec(separatorText);
    const headerLine = start + 1 < end ? start + 1 : undefined;
    const headerRaw = headerLine !== undefined ? lines[headerLine] : '';
    blocks.push({
      kind: separatorMatch ? 'item' : 'placeholder',
      uid: separatorMatch?.groups?.uid,
      level: separatorMatch?.groups?.level,
      separatorLine: start,
      separatorText,
      headerLine,
      headerText: normalizeHeader(headerRaw),
      headerLineIsHeading: HEADING_LINE_REGEX.test(headerRaw),
      text: normalizeText(lines.slice(start + 2, end)),
      endLine
    });
  }

  return blocks;
}

/**
 * Warnings and errors about the block structure of the text as typed
 * (contract: "Structural diagnostics while typing"). Needs no snapshot beyond
 * the UIDs of the last accepted render.
 */
export function checkStructure(blocks: ParsedBlock[], lines: string[], lastRender: RenderedBlock[]): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const knownUids = new Set(lastRender.filter(block => block.uid).map(block => block.uid as string));
  const seen = new Set<string>();
  let documentMarkers = 0;

  for (const block of blocks) {
    switch (block.kind) {
      case 'orphan':
        issues.push({
          code: 'text-before-first-separator',
          severity: 'error',
          line: block.separatorLine,
          message: 'Text before the first item separator - it belongs to no item'
        });
        break;
      case 'document':
        documentMarkers++;
        if (documentMarkers > 1) {
          issues.push({
            code: 'separator-duplicated',
            severity: 'error',
            line: block.separatorLine,
            message: 'The document marker appears more than once'
          });
        }
        break;
      case 'item': {
        const uid = block.uid as string;
        if (seen.has(uid)) {
          issues.push({
            code: 'separator-duplicated',
            severity: 'error',
            line: block.separatorLine,
            uid,
            message: `Separator of ${uid} appears twice`
          });
        } else if (!knownUids.has(uid)) {
          issues.push({
            code: 'separator-unknown',
            severity: 'error',
            line: block.separatorLine,
            uid,
            message: `${uid} is not an item of this document`
          });
        }
        seen.add(uid);
        if (block.headerLine === undefined || !block.headerLineIsHeading) {
          issues.push({
            code: 'missing-header',
            severity: 'warning',
            line: block.headerLine ?? block.separatorLine,
            uid,
            message: `${uid} has no heading line after its separator`
          });
        }
        break;
      }
      case 'placeholder':
        if (block.headerText === '') {
          issues.push({
            code: 'placeholder-empty-heading',
            severity: 'warning',
            line: block.headerLine ?? block.separatorLine,
            message: 'New item has no heading - type one or cancel the placeholder'
          });
        }
        break;
    }
  }

  // A managed line that was edited: still names a known UID, no longer matches.
  const managedLines = new Set(blocks.map(block => block.separatorLine));
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    if (managedLines.has(line) || !text.trimStart().startsWith('<!--')) {
      continue;
    }
    if (line === 0 && /doorstop document/.test(text)) {
      issues.push({
        code: 'separator-changed',
        severity: 'warning',
        line,
        message: 'The document marker was changed'
      });
      continue;
    }
    const uid = [...knownUids].find(candidate => new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(text));
    if (uid) {
      issues.push({
        code: 'separator-changed',
        severity: 'warning',
        line,
        uid,
        message: `Separator of ${uid} was changed`
      });
    }
  }

  return issues;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ItemUpdate {
  uid: string;
  /** Present only when the header differs from the snapshot. */
  header?: string;
  /** Present only when the text differs from the snapshot. */
  text?: string;
  headerOnly: boolean;
  oldHeader: string;
  line: number;
}

export interface ItemCreation {
  afterUid?: string;
  header: string;
  text: string;
  line: number;
}

export interface ChangeSet {
  errors: StructuralIssue[];
  updates: ItemUpdate[];
  creations: ItemCreation[];
  deletions: string[];
  unchanged: string[];
}

/**
 * Diffs the parsed blocks against the snapshot the text was rendered from
 * (contract: "Save plan").
 *
 * `base` is what the user saw and edited; `fresh` is the server's state at
 * save time. A block counts as changed only when it differs from `base`, so a
 * block the user never touched is skipped even if the item changed on disk
 * meanwhile ("Keep my edits" must never write stale text back, spec US6).
 * `fresh` decides what still exists: an item deleted on disk makes its
 * separator unknown, and only items still present can be deleted.
 */
export function planSave(
  blocks: ParsedBlock[],
  base: DocumentNode,
  renderIssues: StructuralIssue[] = [],
  fresh: DocumentNode = base
): ChangeSet {
  // Lookalike separators inside an item's text can never round-trip; they are
  // reported by render() and refuse the save until the item file is fixed.
  const plan: ChangeSet = { errors: renderIssues.filter(issue => issue.code === 'separator-lookalike'), updates: [], creations: [], deletions: [], unchanged: [] };
  const active = base.items.filter(item => item.active);
  const freshByUid = new Map(fresh.items.filter(item => item.active).map(item => [item.uid, item]));
  const byUid = new Map(active.map(item => [item.uid, item]));
  const seen = new Set<string>();
  let documentMarkers = 0;
  let previousItemUid: string | undefined;

  for (const block of blocks) {
    switch (block.kind) {
      case 'orphan':
        plan.errors.push({
          code: 'text-before-first-separator',
          severity: 'error',
          line: block.separatorLine,
          message: 'Text before the first item separator - it belongs to no item'
        });
        break;
      case 'document':
        documentMarkers++;
        if (documentMarkers > 1) {
          plan.errors.push({
            code: 'separator-duplicated',
            severity: 'error',
            line: block.separatorLine,
            message: 'The document marker appears more than once'
          });
        }
        break;
      case 'item': {
        const uid = block.uid as string;
        if (seen.has(uid)) {
          plan.errors.push({
            code: 'separator-duplicated',
            severity: 'error',
            line: block.separatorLine,
            uid,
            message: `Separator of ${uid} appears twice`
          });
          break;
        }
        seen.add(uid);
        const item = freshByUid.has(uid) ? byUid.get(uid) ?? freshByUid.get(uid) : undefined;
        if (!item) {
          plan.errors.push({
            code: 'separator-unknown',
            severity: 'error',
            line: block.separatorLine,
            uid,
            message: freshByUid.has(uid) || !byUid.has(uid)
              ? `${uid} is not an item of this document`
              : `${uid} was deleted on disk - reload the view`
          });
          break;
        }
        previousItemUid = uid;
        const header = block.headerText === uid ? '' : block.headerText;
        const oldHeader = item.header?.trim() ?? '';
        const oldText = normalizeText(item.text ?? '');
        const headerDiffers = header !== oldHeader;
        const textDiffers = block.text !== oldText;
        if (headerDiffers || textDiffers) {
          plan.updates.push({
            uid,
            ...(headerDiffers ? { header } : {}),
            ...(textDiffers ? { text: block.text } : {}),
            headerOnly: headerDiffers && !textDiffers,
            oldHeader,
            line: block.separatorLine
          });
        } else {
          plan.unchanged.push(uid);
        }
        break;
      }
      case 'placeholder':
        if (block.headerText === '' && block.text === '') {
          break;
        }
        plan.creations.push({
          afterUid: previousItemUid,
          header: block.headerText,
          text: block.text,
          line: block.separatorLine
        });
        break;
    }
  }

  plan.deletions = active.map(item => item.uid).filter(uid => !seen.has(uid) && freshByUid.has(uid));
  return plan;
}

/** The lines "+ New item below" inserts (contract: "Placeholder block"). */
export function placeholderBlockText(depth: number): string {
  return `\n${PLACEHOLDER_MARKER}\n${'#'.repeat(Math.min(6, Math.max(1, depth)))} \n`;
}

export interface InsertionPoint {
  /** Line index the placeholder text is inserted in front of. */
  insertAtLine: number;
  depth: number;
  afterUid?: string;
}

/** Where a placeholder goes when inserted "below" the block containing `line`. */
export function insertionPointAfterBlock(blocks: ParsedBlock[], line: number): InsertionPoint {
  let target: ParsedBlock | undefined;
  for (const block of blocks) {
    if (block.kind === 'orphan') {
      continue;
    }
    if (block.separatorLine <= line) {
      target = block;
    }
  }
  if (!target || target.kind === 'document') {
    return { insertAtLine: (target?.endLine ?? 0) + 1, depth: 1, afterUid: undefined };
  }
  // Inserting below a placeholder: the new item still lands after the nearest
  // real item above it, exactly as planSave resolves `afterUid`, and takes
  // that item's depth.
  let anchor: ParsedBlock | undefined;
  for (const block of blocks) {
    if (block.kind === 'item' && block.separatorLine <= target.separatorLine) {
      anchor = block;
    }
  }
  const depth = anchor?.level ? headingDepth(anchor.level) : 1;
  return { insertAtLine: target.endLine + 1, depth, afterUid: anchor?.uid };
}
