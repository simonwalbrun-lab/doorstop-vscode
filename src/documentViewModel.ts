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

/** `label` is the prefix of a document view, or the scope label of a section / filter view. */
export function documentMarker(label: string): string {
  return `<!-- doorstop document ${label}${DOT}keep this line -->`;
}

export function itemSeparator(uid: string, level: string): string {
  return `<!-- ${uid}${DOT}${level}${DOT}item separator. keep this line -->`;
}

// Anchored on the whole line: any deviation makes the line "changed", never a
// looser match. UIDs are validated against the snapshot, so the token class is
// deliberately wide (Doorstop allows UIDs without a separator, e.g. REQ001).
export const DOCUMENT_MARKER_REGEX = /^<!-- doorstop document (?<prefix>[A-Za-z0-9_. -]+?) · keep this line -->$/;
export const ITEM_SEPARATOR_REGEX = /^<!-- (?<uid>[A-Za-z0-9_.-]+) · (?<level>\d+(?:\.\d+)*) · item separator\. keep this line -->$/;
export const PLACEHOLDER_REGEX = /^<!-- new item -->$/;
const HEADING_LINE_REGEX = /^#{1,6}\s+\S/;
const HEADING_PREFIX_REGEX = /^#{1,6}\s+/;

/**
 * What one document view shows (spec 030): a whole document, a section (a tree
 * node plus its descendants) or a snapshot list of filter-result UIDs. `key`
 * is the identity of a view - the same key reveals the existing tab.
 */
export interface ViewScope {
  kind: 'document' | 'section' | 'filter';
  key: string;
  /** Line-1 marker label and tab-title stem: `SYS`, `SYS-0012 section`, `Filter 2`. */
  label: string;
  /** document: the document. */
  prefix?: string;
  /** section: the node whose descendants are shown. */
  rootUid?: string;
  /** filter: the UIDs at open time; section: items created in the view, kept even outside the subtree. */
  uids?: string[];
}

export function documentScope(prefix: string): ViewScope {
  return { kind: 'document', key: `doc:${prefix}`, label: prefix, prefix };
}

export function sectionScope(rootUid: string): ViewScope {
  return { kind: 'section', key: `sec:${rootUid}`, label: `${rootUid} section`, rootUid };
}

export function filterScope(number: number, uids: string[]): ViewScope {
  return { kind: 'filter', key: `flt:${number}`, label: `Filter ${number}`, uids };
}

/** Title of the view's tab, also the last path segment of its URI. */
export function viewTitle(scope: ViewScope): string {
  return `${scope.kind === 'section' ? scope.rootUid : scope.label} (${scope.kind})`;
}

export function viewUriFor(scope: ViewScope | string): vscode.Uri {
  const title = viewTitle(typeof scope === 'string' ? documentScope(scope) : scope);
  return vscode.Uri.from({ scheme: DOCUMENT_VIEW_SCHEME, path: `/${title}` });
}

/** The scope key a view URI stands for, or undefined for any other URI. */
export function scopeKeyFromViewUri(uri: vscode.Uri): string | undefined {
  if (uri.scheme !== DOCUMENT_VIEW_SCHEME) {
    return undefined;
  }
  const match = /^\/(.+) \((document|section|filter)\)$/.exec(uri.path);
  if (!match) {
    return undefined;
  }
  switch (match[2]) {
    case 'document': return `doc:${match[1]}`;
    case 'section': return `sec:${match[1]}`;
    default: return `flt:${/(\d+)$/.exec(match[1])?.[1] ?? match[1]}`;
  }
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

export const FIELDS_FENCE_OPEN = '```doorstop-fields';
export const FIELDS_FENCE_CLOSE = '```';

/** Header fields the view never edits as fields: dedicated commands or its own text lines own them. */
export const PROTECTED_FIELDS: ReadonlySet<string> = new Set([
  'uid', 'level', 'active', 'normative', 'derived', 'reviewed', 'cleared', 'links', 'header', 'text'
]);

/** Trims and de-duplicates the `doorstop.documentView.fields` setting; protected names are returned apart. */
export function normaliseFieldList(raw: unknown): { fields: string[]; protectedNames: string[] } {
  const fields: string[] = [];
  const protectedNames: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const name = typeof entry === 'string' ? entry.trim() : '';
    if (!name || fields.includes(name) || protectedNames.includes(name)) {
      continue;
    }
    if (PROTECTED_FIELDS.has(name.toLowerCase())) {
      protectedNames.push(name);
    } else if (!/[:\s]/.test(name)) {
      // A name with a colon or whitespace could not round-trip through a `name: value` line.
      fields.push(name);
    }
  }
  return { fields, protectedNames };
}

/** The configured fields `item` carries (single-line values only), in setting order. */
export function itemFieldEntries(item: Pick<ItemNode, 'fields'>, fields: string[]): [string, string][] {
  const entries: [string, string][] = [];
  for (const name of fields) {
    const value = item.fields?.[name];
    if (typeof value === 'string' && !/[\r\n]/.test(value)) {
      entries.push([name, value]);
    }
  }
  return entries;
}

/** The fence lines the view shows under an item's heading; empty when it has no configured field. */
export function fieldsBlockLines(item: Pick<ItemNode, 'fields'>, fields: string[]): string[] {
  const entries = itemFieldEntries(item, fields);
  return entries.length === 0 ? [] : [FIELDS_FENCE_OPEN, ...entries.map(([name, value]) => `${name}: ${value}`), FIELDS_FENCE_CLOSE];
}

export type StructuralCode =
  | 'text-before-first-separator'
  | 'separator-duplicated'
  | 'separator-unknown'
  | 'separator-lookalike'
  | 'separator-changed'
  | 'missing-header'
  | 'fields-structure'
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
export function render(document: DocumentNode, fields: string[] = []): RenderResult {
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
    const fieldLines = fieldsBlockLines(item, fields);
    lines.push(...fieldLines);
    // A heading item (non-normative, header, no text) simply has no text lines;
    // no special case is needed, and an item with text always shows it.
    const textLines = item.text ? item.text.split(/\r?\n/) : [];
    for (const [textIndex, textLine] of textLines.entries()) {
      // A first text line equal to the fence would be read back as a fields block.
      const fenceLookalike = textIndex === 0 && fieldLines.length === 0 && textLine === FIELDS_FENCE_OPEN;
      if (isManagedLine(textLine) || fenceLookalike) {
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
  /** The fields fence directly under the heading of an item block, when there is one. */
  fields?: ParsedFields;
}

export interface ParsedFields {
  openLine: number;
  /** Line of the closing fence; undefined when the block ends first. */
  closeLine?: number;
  entries: { line: number; name: string; value: string }[];
  /** Field lines that are not `name: value`. */
  malformed: number[];
}

function lastNonBlank(lines: string[], from: number, toExclusive: number): number {
  for (let line = toExclusive - 1; line >= from; line--) {
    if (lines[line].trim() !== '') {
      return line;
    }
  }
  return from;
}

function parseFields(lines: string[], from: number, end: number): ParsedFields | undefined {
  if (from >= end || lines[from] !== FIELDS_FENCE_OPEN) {
    return undefined;
  }
  const fields: ParsedFields = { openLine: from, entries: [], malformed: [] };
  for (let line = from + 1; line < end; line++) {
    if (lines[line] === FIELDS_FENCE_CLOSE) {
      fields.closeLine = line;
      break;
    }
    const match = /^([^:\s]+):[ \t]?(.*)$/.exec(lines[line]);
    if (match) {
      fields.entries.push({ line, name: match[1], value: match[2].trim() });
    } else {
      fields.malformed.push(line);
    }
  }
  return fields;
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
    const fields = separatorMatch && headerLine !== undefined && HEADING_LINE_REGEX.test(headerRaw)
      ? parseFields(lines, headerLine + 1, end)
      : undefined;
    const bodyStart = fields ? (fields.closeLine ?? end - 1) + 1 : start + 2;
    blocks.push({
      kind: separatorMatch ? 'item' : 'placeholder',
      uid: separatorMatch?.groups?.uid,
      level: separatorMatch?.groups?.level,
      separatorLine: start,
      separatorText,
      headerLine,
      headerText: normalizeHeader(headerRaw),
      headerLineIsHeading: HEADING_LINE_REGEX.test(headerRaw),
      text: normalizeText(lines.slice(bodyStart, end)),
      endLine,
      ...(fields ? { fields } : {})
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
        if (block.fields && (block.fields.closeLine === undefined || block.fields.malformed.length > 0)) {
          issues.push({
            code: 'fields-structure',
            severity: 'error',
            line: block.fields.malformed[0] ?? block.fields.openLine,
            uid,
            message: block.fields.closeLine === undefined
              ? `The fields block of ${uid} is not closed`
              : `A line in the fields block of ${uid} is not 'name: value'`
          });
        }
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
  /** Present only when at least one field value differs from the snapshot. */
  fields?: Record<string, string>;
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
  fresh: DocumentNode = base,
  fieldNames: string[] = []
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
        const fieldChanges = diffFields(block, item, fieldNames, plan.errors);
        if (headerDiffers || textDiffers || fieldChanges) {
          plan.updates.push({
            uid,
            ...(headerDiffers ? { header } : {}),
            ...(textDiffers ? { text: block.text } : {}),
            ...(fieldChanges ? { fields: fieldChanges } : {}),
            headerOnly: headerDiffers && !textDiffers && !fieldChanges,
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

/**
 * Field value changes of one item block against the snapshot. The set and
 * order of field lines is fixed by the snapshot and the setting; anything else
 * is a structural error (fields are edited here, never added or removed).
 */
function diffFields(block: ParsedBlock, item: ItemNode, fieldNames: string[], errors: StructuralIssue[]): Record<string, string> | undefined {
  const expected = itemFieldEntries(item, fieldNames);
  const uid = item.uid;
  const fail = (line: number, message: string): undefined => {
    errors.push({ code: 'fields-structure', severity: 'error', line, uid, message });
    return undefined;
  };
  if (!block.fields) {
    return expected.length === 0 ? undefined : fail(block.headerLine ?? block.separatorLine, `The fields block of ${uid} was removed`);
  }
  const fields = block.fields;
  if (expected.length === 0) {
    return fail(fields.openLine, `${uid} has none of the configured fields - the fields block does not belong here`);
  }
  if (fields.closeLine === undefined) {
    return fail(fields.openLine, `The fields block of ${uid} is not closed`);
  }
  if (fields.malformed.length > 0) {
    return fail(fields.malformed[0], `A line in the fields block of ${uid} is not 'name: value'`);
  }
  if (fields.entries.length !== expected.length || fields.entries.some((entry, index) => entry.name !== expected[index][0])) {
    return fail(fields.openLine, `The field lines of ${uid} must be exactly ${expected.map(([name]) => name).join(', ')}`);
  }
  const changes: Record<string, string> = {};
  fields.entries.forEach((entry, index) => {
    if (entry.value !== expected[index][1].trim()) {
      changes[entry.name] = entry.value;
    }
  });
  return Object.keys(changes).length > 0 ? changes : undefined;
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

export interface DecorationLines {
  /** Managed lines (document marker, separators, placeholder markers) to dim. */
  separators: number[];
  /** Line spans of every second item/placeholder block, to tint. */
  tinted: { start: number; end: number }[];
}

/** Which lines the editor dims and tints (FR-012, FR-039); pure so it is testable without an editor. */
export function decorationLines(blocks: ParsedBlock[]): DecorationLines {
  const result: DecorationLines = { separators: [], tinted: [] };
  let index = 0;
  for (const block of blocks) {
    if (block.kind === 'orphan') {
      continue;
    }
    result.separators.push(block.separatorLine);
    if (block.fields) {
      result.separators.push(block.fields.openLine);
      if (block.fields.closeLine !== undefined) {
        result.separators.push(block.fields.closeLine);
      }
    }
    if (block.kind === 'item' || block.kind === 'placeholder') {
      if (index % 2 === 1) {
        result.tinted.push({ start: block.separatorLine, end: block.endLine });
      }
      index++;
    }
  }
  return result;
}
