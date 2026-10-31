import * as path from 'node:path';

/**
 * Text-level facts about Doorstop item files, shared by the providers that scan
 * an item's own lines (problem anchors, review lenses, header folding, hover,
 * go-to-definition). Item *data* still comes only from the server.
 */

/** A UID token in text, e.g. `REQ-001`. Global, as getWordRangeAtPosition expects. */
export const UID_REGEX = /\b[A-Z0-9_-]+-\d+\b/g;
export const DERIVED_LINE_REGEX = /^\s*derived\s*:/i;
/** A YAML sequence entry, capturing the UID token before an optional `: stamp`. */
export const LINK_ENTRY_REGEX = /^\s*-\s+([^\s:]+)\s*(?::|$)/;
const FRONTMATTER_FENCE_REGEX = /^---\s*$/;

/** The UID an item file stands for (Doorstop names the file after it); undefined unless `.yml`/`.md`. */
export function uidFromItemPath(fsPath: string): string | undefined {
  const extension = path.extname(fsPath);
  const lower = extension.toLowerCase();
  return lower === '.yml' || lower === '.md' ? path.basename(fsPath, extension) : undefined;
}

/**
 * The lines holding an item's metadata: the whole file for a YAML item, only the
 * `---` frontmatter for a markdown one, so a `links:` line written in the prose
 * body is never mistaken for metadata. Undefined when a markdown file has no
 * frontmatter; `closed` is false when its fence never ends (the range then runs
 * to the end of the file). Callers decide what each case means for them.
 */
export function metadataRange(
  lines: string[],
  isMarkdown: boolean
): { start: number; end: number; closed: boolean } | undefined {
  if (!isMarkdown) {
    return { start: 0, end: lines.length, closed: true };
  }
  if (lines.length === 0 || !FRONTMATTER_FENCE_REGEX.test(lines[0])) {
    return undefined;
  }
  for (let line = 1; line < lines.length; line++) {
    if (FRONTMATTER_FENCE_REGEX.test(lines[line])) {
      return { start: 1, end: line, closed: true };
    }
  }
  return { start: 1, end: lines.length, closed: false };
}
