import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopIndex, getDocumentUid, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';

export const UID_REGEX = /\b[A-Z0-9_-]+-\d+\b/g;
const DERIVED_LINE_REGEX = /^\s*derived\s*:/i;
const YAML_HEADER_LINE_REGEX = /^\s*header\s*:/i;
const MARKDOWN_HEADING_LINE_REGEX = /^#{1,6}\s+/;

interface DefinitionProviderOptions {
  server: DoorstopServer;
  workspaceFolder: vscode.WorkspaceFolder;
  /** Overridable so tests can observe the broken-reference report without a live UI. */
  reportBrokenReference?: (message: string) => void;
}

async function findLineMatching(uri: vscode.Uri, lineRegex: RegExp): Promise<vscode.Location> {
  try {
    const rawContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const lines = rawContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lineRegex.test(lines[i])) {
        return new vscode.Location(uri, new vscode.Position(i, 0));
      }
    }
  } catch (error) {
    console.error(`[Doorstop][definition] Failed to read ${uri.fsPath}:`, error instanceof Error ? error.message : String(error));
  }
  return new vscode.Location(uri, new vscode.Range(0, 0, 0, 0));
}

/** The item's header line (`header:` for `.yml`, first `#` heading for `.md`); line 0 when neither is found. */
export function findHeaderLocation(uri: vscode.Uri): Promise<vscode.Location> {
  const extension = path.extname(uri.fsPath).toLowerCase();
  const lineRegex = extension === '.md' ? MARKDOWN_HEADING_LINE_REGEX : YAML_HEADER_LINE_REGEX;
  return findLineMatching(uri, lineRegex);
}

/** The first line of `uri` that names `targetUid` as a whole word; line 0 when it is not mentioned. */
export function findReferenceLocation(uri: vscode.Uri, targetUid: string): Promise<vscode.Location> {
  return findLineMatching(uri, new RegExp(`\\b${targetUid}\\b`));
}

async function findUsageLocations(
  document: vscode.TextDocument,
  index: DoorstopIndex
): Promise<vscode.Location[]> {
  const currentUid = getDocumentUid(document, index);
  if (!currentUid) {
    return [];
  }

  const locations: vscode.Location[] = [];
  for (const linkerUid of index.getLinkers(currentUid)) {
    const linkerUri = index.getUri(linkerUid);
    if (linkerUri) {
      locations.push(await findReferenceLocation(linkerUri, currentUid));
    }
  }
  return locations;
}

/**
 * The message shown when a UID in a link resolves to nothing. Exported so the
 * exact wording is asserted by tests rather than only "no location returned" -
 * silently returning `undefined` is indistinguishable from "not a UID at all"
 * (spec 012, finding C7).
 */
export function brokenReferenceMessage(uid: string): string {
  return `Doorstop: "${uid}" does not match any item known to the Doorstop server. `
    + 'The link may be broken, or the server may need a refresh.';
}

/** True when the token really is a Doorstop link the user could expect to follow. */
function isLinkReference(document: vscode.TextDocument, position: vscode.Position): boolean {
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

/**
 * The outcome of a go-to-definition request at one position. `brokenUid` is set
 * when the token is a link the user could reasonably expect to follow but the
 * server knows no such item - the case spec 012 requires to be "reported
 * clearly", and which is indistinguishable from "not a UID" if all a caller can
 * observe is an empty location list.
 */
export interface DefinitionResolution {
  location?: vscode.Location;
  brokenUid?: string;
}

/** Exported for tests: the resolution itself, with no UI side effects. */
export async function resolveDefinitionAt(
  document: vscode.TextDocument,
  position: vscode.Position,
  index: DoorstopIndex
): Promise<DefinitionResolution> {
  const range = document.getWordRangeAtPosition(position, UID_REGEX);
  if (!range) {
    return {};
  }
  const hoveredUid = document.getText(range);
  const targetUri = index.getUri(hoveredUid);
  if (!targetUri) {
    // Only complain about tokens that are actually meant to be links; a UID-shaped
    // word in prose is not a broken reference.
    return isLinkReference(document, position) ? { brokenUid: hoveredUid } : {};
  }
  return { location: await findHeaderLocation(targetUri) };
}

export function registerDefinitionProvider(context: vscode.ExtensionContext, options: DefinitionProviderOptions): void {
  const { server } = options;
  const reportBrokenReference = options.reportBrokenReference
    ?? ((message: string) => void vscode.window.showWarningMessage(message));
  const selector: vscode.DocumentSelector = [{ language: 'yaml' }, { language: 'markdown' }];

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    async provideDefinition(document, position) {
      const index = await loadDoorstopIndex(server);
      if (!index) {
        return undefined;
      }
      if (DERIVED_LINE_REGEX.test(document.lineAt(position.line).text)) {
        return findUsageLocations(document, index);
      }
      const resolution = await resolveDefinitionAt(document, position, index);
      if (resolution.brokenUid) {
        reportBrokenReference(brokenReferenceMessage(resolution.brokenUid));
      }
      return resolution.location;
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    async provideReferences(document, position) {
      if (!DERIVED_LINE_REGEX.test(document.lineAt(position.line).text)) {
        return [];
      }
      const index = await loadDoorstopIndex(server);
      return index ? findUsageLocations(document, index) : [];
    }
  });

  context.subscriptions.push(definitionProvider, referenceProvider);
}
