import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { TreeResponse } from './doorstopTypes';

const UID_REGEX = /\b[A-Z0-9_-]+-\d+\b/g;
const DERIVED_LINE_REGEX = /^\s*derived\s*:/i;
const YAML_HEADER_LINE_REGEX = /^\s*header\s*:/i;
const MARKDOWN_HEADING_LINE_REGEX = /^#{1,6}\s+/;

interface DefinitionProviderOptions {
  server: DoorstopServer;
  workspaceFolder: vscode.WorkspaceFolder;
}

interface ItemIndex {
  pathByUid: Map<string, string>;
  linkersByUid: Map<string, string[]>;
}

function getCurrentUid(document: vscode.TextDocument): string | undefined {
  const extension = path.extname(document.fileName).toLowerCase();
  if (extension !== '.yml' && extension !== '.md') {
    return undefined;
  }
  return path.basename(document.fileName, extension);
}

/** Sourced from GET /tree (the server's own computed truth) rather than re-parsing YAML client-side. */
async function buildItemIndex(server: DoorstopServer): Promise<ItemIndex | undefined> {
  let response: TreeResponse;
  try {
    response = await server.request<TreeResponse>('GET', '/tree');
  } catch (error) {
    console.error('[Doorstop][definition] Failed to load tree from server:', error instanceof Error ? error.message : String(error));
    return undefined;
  }

  const pathByUid = new Map<string, string>();
  const linkersByUid = new Map<string, string[]>();
  for (const document of response.documents) {
    for (const item of document.items) {
      pathByUid.set(item.uid, item.path);
      for (const link of item.links) {
        const linkers = linkersByUid.get(link.uid);
        if (linkers) {
          linkers.push(item.uid);
        } else {
          linkersByUid.set(link.uid, [item.uid]);
        }
      }
    }
  }
  return { pathByUid, linkersByUid };
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

function findHeaderLocation(uri: vscode.Uri): Promise<vscode.Location> {
  const extension = path.extname(uri.fsPath).toLowerCase();
  const lineRegex = extension === '.md' ? MARKDOWN_HEADING_LINE_REGEX : YAML_HEADER_LINE_REGEX;
  return findLineMatching(uri, lineRegex);
}

function findReferenceLocation(uri: vscode.Uri, targetUid: string): Promise<vscode.Location> {
  return findLineMatching(uri, new RegExp(`\\b${targetUid}\\b`));
}

async function findUsageLocations(document: vscode.TextDocument, server: DoorstopServer): Promise<vscode.Location[]> {
  const currentUid = getCurrentUid(document);
  if (!currentUid) {
    return [];
  }
  const index = await buildItemIndex(server);
  const linkerUids = index?.linkersByUid.get(currentUid) ?? [];

  const locations: vscode.Location[] = [];
  for (const linkerUid of linkerUids) {
    const linkerPath = index?.pathByUid.get(linkerUid);
    if (linkerPath) {
      locations.push(await findReferenceLocation(vscode.Uri.file(linkerPath), currentUid));
    }
  }
  return locations;
}

async function findDefinitionLocation(
  document: vscode.TextDocument,
  position: vscode.Position,
  server: DoorstopServer
): Promise<vscode.Location | undefined> {
  const range = document.getWordRangeAtPosition(position, UID_REGEX);
  if (!range) {
    return undefined;
  }
  const hoveredUid = document.getText(range);
  const index = await buildItemIndex(server);
  const targetPath = index?.pathByUid.get(hoveredUid);
  if (!targetPath) {
    return undefined;
  }
  return findHeaderLocation(vscode.Uri.file(targetPath));
}

export function registerDefinitionProvider(context: vscode.ExtensionContext, options: DefinitionProviderOptions): void {
  const { server } = options;
  const selector: vscode.DocumentSelector = [{ language: 'yaml' }, { language: 'markdown' }];

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    async provideDefinition(document, position) {
      const lineText = document.lineAt(position.line).text;
      if (DERIVED_LINE_REGEX.test(lineText)) {
        return findUsageLocations(document, server);
      }
      return findDefinitionLocation(document, position, server);
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    async provideReferences(document, position) {
      const lineText = document.lineAt(position.line).text;
      if (DERIVED_LINE_REGEX.test(lineText)) {
        return findUsageLocations(document, server);
      }
      return [];
    }
  });

  context.subscriptions.push(definitionProvider, referenceProvider);
}
