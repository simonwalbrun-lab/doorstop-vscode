import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { DocumentNode, FieldAnchor, TreeResponse, ValidationIssue, ValidationResponse } from './doorstopTypes';

/**
 * Renders Doorstop's own validation output as editor diagnostics.
 *
 * The division of labour is deliberate: the server decides *what* is a problem
 * and *which field* it concerns (that is Doorstop knowledge), and this file
 * decides *which line* that field is on (that is VS Code knowledge). Nothing
 * here inspects `message` or re-derives a severity - see
 * specs/014-doorstop-validation-diagnostics/research.md sections 4 and 5.
 *
 * Problems describe the state **on disk**. A dirty buffer may lag until it is
 * saved, which matches how Doorstop validates (it reloads each item from disk).
 */

const DEBOUNCE_MS = 300;

export interface ProblemsProviderOptions {
  server: DoorstopServer;
  workspaceFolder: vscode.WorkspaceFolder;
  /** Overridable so tests can observe failure reports without a modal. */
  reportFailure?: (message: string) => void;
}

/** Where one issue lands, for one of the items it names. */
interface AnchorResolution {
  uri: vscode.Uri;
  range: vscode.Range;
  /** True when the intended field was absent and the first-line fallback applied. */
  fallbackUsed: boolean;
}

const SEVERITY_BY_NAME: Record<ValidationIssue['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information
};

/** The YAML key each anchor field lives under. `ref` also accepts `references`. */
const FIELD_KEYS: Partial<Record<FieldAnchor, string[]>> = {
  level: ['level'],
  text: ['text'],
  reviewed: ['reviewed'],
  links: ['links'],
  derived: ['derived'],
  ref: ['ref', 'references']
};

/** A YAML sequence entry, capturing the UID token before an optional `: stamp`. */
const LINK_ENTRY_REGEX = /^\s*-\s+([^\s:]+)\s*(?::|$)/;
const LINKS_KEY_REGEX = /^\s*links\s*:/i;
const FRONTMATTER_FENCE_REGEX = /^---\s*$/;

function keyRegex(key: string): RegExp {
  return new RegExp(`^\\s*${key}\\s*:`, 'i');
}

function lineRange(line: number, text?: string): vscode.Range {
  return new vscode.Range(line, 0, line, text?.length ?? 0);
}

/**
 * Reads each file at most once per refresh pass. A single validation run can
 * name the same item many times over, and the file contents cannot change
 * mid-pass - the problems describe one on-disk snapshot.
 */
class FileTextCache {
  private readonly lines = new Map<string, string[]>();

  async getLines(uri: vscode.Uri): Promise<string[] | undefined> {
    const key = uri.toString();
    const cached = this.lines.get(key);
    if (cached) {
      return cached;
    }
    try {
      const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      // CRLF on Windows - the same split the other providers use.
      const lines = raw.split(/\r?\n/);
      this.lines.set(key, lines);
      return lines;
    } catch (error) {
      console.error(
        `[Doorstop][problems] Could not read ${uri.fsPath}:`,
        error instanceof Error ? error.message : String(error)
      );
      return undefined;
    }
  }
}

/**
 * The metadata region of an item file: the whole file for an attribute-format
 * item, and only the `---` frontmatter for a markdown one - so a `links:` line
 * written in the prose body cannot capture an anchor.
 */
function getMetadataRange(lines: string[], isMarkdown: boolean): { start: number; end: number } {
  if (!isMarkdown) {
    return { start: 0, end: lines.length };
  }
  if (lines.length === 0 || !FRONTMATTER_FENCE_REGEX.test(lines[0])) {
    return { start: 0, end: 0 };
  }
  for (let line = 1; line < lines.length; line++) {
    if (FRONTMATTER_FENCE_REGEX.test(lines[line])) {
      return { start: 1, end: line };
    }
  }
  return { start: 1, end: lines.length };
}

function findKeyLine(
  lines: string[],
  keys: string[],
  range: { start: number; end: number }
): number | undefined {
  for (let line = range.start; line < range.end; line++) {
    if (keys.some(key => keyRegex(key).test(lines[line]))) {
      return line;
    }
  }
  return undefined;
}

/**
 * The link entry whose UID token equals `relatedUid`, searched only inside the
 * consecutive sequence entries that follow the `links:` key.
 */
function findLinkEntryLine(
  lines: string[],
  relatedUid: string,
  range: { start: number; end: number }
): number | undefined {
  const linksLine = findKeyLine(lines, ['links'], range);
  if (linksLine === undefined) {
    return undefined;
  }
  for (let line = linksLine + 1; line < range.end; line++) {
    const match = LINK_ENTRY_REGEX.exec(lines[line]);
    if (!match) {
      break;
    }
    if (match[1] === relatedUid) {
      return line;
    }
  }
  return undefined;
}

/** The last non-empty line of a markdown item - where an empty-text warning lands (FR-007). */
function lastContentLine(lines: string[]): number {
  for (let line = lines.length - 1; line >= 0; line--) {
    if (lines[line].trim().length > 0) {
      return line;
    }
  }
  return 0;
}

interface TreeIndex {
  pathByUid: Map<string, string>;
  documentByUid: Map<string, DocumentNode>;
  documentByPrefix: Map<string, DocumentNode>;
}

function indexTree(tree: TreeResponse): TreeIndex {
  const pathByUid = new Map<string, string>();
  const documentByUid = new Map<string, DocumentNode>();
  const documentByPrefix = new Map<string, DocumentNode>();
  for (const document of tree.documents) {
    documentByPrefix.set(document.prefix, document);
    for (const item of document.items) {
      pathByUid.set(item.uid, item.path);
      documentByUid.set(item.uid, document);
    }
  }
  return { pathByUid, documentByUid, documentByPrefix };
}

/**
 * Resolves one issue, for one of the items it names, to a place in a file.
 * Never fails: every step falls through to the item's first line, so no problem
 * is dropped for want of an anchor (FR-010, FR-011).
 */
export async function resolveAnchor(
  issue: ValidationIssue,
  uid: string | undefined,
  index: TreeIndex,
  cache: FileTextCache
): Promise<AnchorResolution | undefined> {
  const document = uid ? index.documentByUid.get(uid) : index.documentByPrefix.get(issue.documentPrefix);
  const documentMarker = document ?? index.documentByPrefix.get(issue.documentPrefix);

  // Document-level issue, or an item the server named but the tree does not
  // place: annotate the document's config file rather than dropping the problem.
  const itemPath = uid ? index.pathByUid.get(uid) : undefined;
  if (!itemPath) {
    if (!documentMarker) {
      return undefined;
    }
    return {
      uri: vscode.Uri.file(documentMarker.markerPath),
      range: new vscode.Range(0, 0, 0, 0),
      fallbackUsed: uid !== undefined
    };
  }

  const uri = vscode.Uri.file(itemPath);
  const lines = await cache.getLines(uri);
  if (!lines) {
    return { uri, range: new vscode.Range(0, 0, 0, 0), fallbackUsed: true };
  }

  const isMarkdown = itemPath.toLowerCase().endsWith('.md');
  const range = getMetadataRange(lines, isMarkdown);

  let line: number | undefined;
  if (issue.field === 'link_entry' && issue.relatedUid) {
    line = findLinkEntryLine(lines, issue.relatedUid, range);
  } else if (issue.field === 'text' && isMarkdown) {
    // A markdown item's text is its prose body, not a `text:` key (FR-007).
    line = lastContentLine(lines);
  } else if (issue.field) {
    const keys = FIELD_KEYS[issue.field];
    line = keys ? findKeyLine(lines, keys, range) : undefined;
  }

  const fallbackUsed = line === undefined;
  const anchorLine = line ?? range.start;
  return {
    uri,
    range: lineRange(anchorLine, lines[anchorLine]),
    fallbackUsed
  };
}

function buildDiagnostic(issue: ValidationIssue, anchor: AnchorResolution): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    anchor.range,
    issue.message,
    SEVERITY_BY_NAME[issue.severity] ?? vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = 'doorstop';
  diagnostic.code = issue.check;
  return diagnostic;
}

/**
 * Turns a whole validation response into the diagnostics for each file.
 * Exported for tests: this is the pure half, with no collection and no timers.
 */
export async function buildDiagnostics(
  validation: ValidationResponse,
  tree: TreeResponse
): Promise<Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>> {
  const index = indexTree(tree);
  const cache = new FileTextCache();
  const byFile = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

  for (const issue of validation.issues) {
    // One diagnostic per named item, all carrying the same message and severity
    // (FR-005). An issue naming no item is a document-level one.
    const targets: (string | undefined)[] = issue.uids.length > 0 ? issue.uids : [undefined];
    for (const uid of targets) {
      const anchor = await resolveAnchor(issue, uid, index, cache);
      if (!anchor) {
        console.warn('[Doorstop][problems] No anchor for issue, dropping:', issue.check, uid);
        continue;
      }
      const key = anchor.uri.toString();
      const entry = byFile.get(key) ?? { uri: anchor.uri, diagnostics: [] };
      entry.diagnostics.push(buildDiagnostic(issue, anchor));
      byFile.set(key, entry);
    }
  }
  return byFile;
}

export interface ProblemsProvider {
  /** Refreshes now, bypassing the debounce. */
  refreshNow(): Promise<void>;
  /** Refreshes after the debounce interval, superseding any pending refresh. */
  scheduleRefresh(): void;
}

export function registerProblemsProvider(
  context: vscode.ExtensionContext,
  options: ProblemsProviderOptions
): ProblemsProvider {
  const collection = vscode.languages.createDiagnosticCollection('doorstop');
  const reportFailure = options.reportFailure
    ?? ((message: string) => void vscode.window.showWarningMessage(message));

  let debounceTimer: NodeJS.Timeout | undefined;
  // Only the newest refresh may write to the collection: a burst of saves
  // collapses to one visible result instead of racing older responses onto
  // the screen.
  let latestPass = 0;
  // Guards the failure notification so it fires once per failure transition,
  // not once per debounce tick.
  let lastPassFailed = false;

  const refreshNow = async (): Promise<void> => {
    const pass = ++latestPass;
    try {
      const [validation, tree] = await Promise.all([
        options.server.request<ValidationResponse>('GET', '/validate'),
        options.server.request<TreeResponse>('GET', '/tree')
      ]);
      const byFile = await buildDiagnostics(validation, tree);
      if (pass !== latestPass) {
        return;
      }

      // Replaces the whole set every pass, so a problem that has been fixed -
      // or an item that no longer exists - disappears (FR-016).
      collection.clear();
      for (const entry of byFile.values()) {
        collection.set(entry.uri, entry.diagnostics);
      }
      lastPassFailed = false;
    } catch (error) {
      if (pass !== latestPass) {
        return;
      }
      // Never leave stale problems on screen presenting themselves as current
      // (FR-014): an empty list plus a message is unambiguous, a five-minute-old
      // list is not.
      collection.clear();
      if (!lastPassFailed) {
        lastPassFailed = true;
        const message = error instanceof Error ? error.message : String(error);
        reportFailure(`Doorstop could not check for problems: ${message}`);
      }
    }
  };

  const scheduleRefresh = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void refreshNow();
    }, DEBOUNCE_MS);
  };

  const isRequirementFile = (document: vscode.TextDocument): boolean => {
    const fsPath = document.uri.fsPath.toLowerCase();
    return (fsPath.endsWith('.yml') || fsPath.endsWith('.md'))
      && fsPath.startsWith(options.workspaceFolder.uri.fsPath.toLowerCase());
  };

  const onSave = vscode.workspace.onDidSaveTextDocument(document => {
    if (isRequirementFile(document)) {
      scheduleRefresh();
    }
  });

  // The `doorstop.recheckProblems` command is registered by extension.ts, not
  // here: a command id can only be registered once per host, and keeping it out
  // of the provider is what lets a second, independent provider be constructed
  // (a test does exactly that to exercise the failure path).
  context.subscriptions.push(
    collection,
    onSave,
    { dispose: () => debounceTimer && clearTimeout(debounceTimer) }
  );

  return { refreshNow, scheduleRefresh };
}
