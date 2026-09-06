import * as path from 'node:path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

import { DoorstopServer, DOORSTOP_SERVER_HOST, DOORSTOP_SERVER_PORT } from './doorstopServer';

export interface DeriveCommandContext {
  sourceUid: string;
  sourceUri: vscode.Uri;
}

interface DeriveProviderOptions {
  server: DoorstopServer;
  workspaceFolder: vscode.WorkspaceFolder;
  getPythonPath: () => Promise<string>;
  onChanged?: () => void;
}

interface DoorstopDocument {
  prefix: string;
  parent?: string;
  marker: vscode.Uri;
}

function findPrefix(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const prefix = findPrefix(entry);
      if (prefix) {
        return prefix;
      }
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.prefix === 'string' && record.prefix.trim()) {
    return record.prefix.trim();
  }
  for (const entry of Object.values(record)) {
    const prefix = findPrefix(entry);
    if (prefix) {
      return prefix;
    }
  }
  return undefined;
}

function findParent(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parent = findParent(entry);
      if (parent) {
        return parent;
      }
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.parent === 'string' && record.parent.trim()) {
    return record.parent.trim();
  }
  for (const entry of Object.values(record)) {
    const parent = findParent(entry);
    if (parent) {
      return parent;
    }
  }
  return undefined;
}

async function getDocuments(workspaceFolder: vscode.WorkspaceFolder): Promise<DoorstopDocument[]> {
  const markers = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/.doorstop.yml'),
    '**/{node_modules,.git,out,dist}/**'
  );
  const documents: DoorstopDocument[] = [];
  for (const marker of markers) {
    try {
      const content = await vscode.workspace.fs.readFile(marker);
      const parsed = yaml.load(new TextDecoder().decode(content));
      const prefix = findPrefix(parsed);
      if (prefix) {
        documents.push({ prefix, parent: findParent(parsed), marker });
      }
    } catch {
      // Ignore invalid marker files.
    }
  }
  const unique = new Map(documents.map(document => [document.prefix, document]));
  return [...unique.values()].sort((left, right) => left.prefix.localeCompare(right.prefix));
}

function getSourceDocumentPrefix(sourceUri: vscode.Uri, documents: DoorstopDocument[]): string | undefined {
  return documents
    .filter(document => {
      const relative = path.relative(path.dirname(document.marker.fsPath), sourceUri.fsPath);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    })
    .sort((left, right) => path.dirname(right.marker.fsPath).length - path.dirname(left.marker.fsPath).length)
    .at(0)?.prefix;
}

function getSameLevelAndBelowPrefixes(sourcePrefix: string, documents: DoorstopDocument[]): string[] {
  const parentByPrefix = new Map<string, string>();
  for (const document of documents) {
    if (document.parent) {
      parentByPrefix.set(document.prefix, document.parent);
    }
  }

  const depthByPrefix = new Map<string, number>();
  const getDepth = (prefix: string, visiting = new Set<string>()): number => {
    const knownDepth = depthByPrefix.get(prefix);
    if (knownDepth !== undefined) {
      return knownDepth;
    }
    if (visiting.has(prefix)) {
      return 0;
    }
    const parent = parentByPrefix.get(prefix);
    const depth = parent ? getDepth(parent, new Set(visiting).add(prefix)) + 1 : 0;
    depthByPrefix.set(prefix, depth);
    return depth;
  };

  const sourceDepth = getDepth(sourcePrefix);
  return documents
    .filter(document => document.prefix !== sourcePrefix && getDepth(document.prefix) >= sourceDepth)
    .map(document => document.prefix)
    .sort((left, right) => left.localeCompare(right));
}

function getSourceUid(document: vscode.TextDocument): string | undefined {
  const extension = path.extname(document.fileName).toLowerCase();
  if (extension !== '.yml' && extension !== '.md') {
    return undefined;
  }
  return path.basename(document.fileName, extension);
}

function parseAddedUid(output: string): string | undefined {
  const match = output.match(/(?:^|\r?\n)\s*added item:\s*([A-Za-z0-9_.-]+)\s*\(/i);
  return match?.[1];
}

export function registerDeriveProvider(
  context: vscode.ExtensionContext,
  options: DeriveProviderOptions
): void {
  const provider: vscode.CodeLensProvider = {
    provideCodeLenses(document): vscode.CodeLens[] {
      const lenses: vscode.CodeLens[] = [];
      for (let line = 0; line < document.lineCount; line++) {
        const sourceUid = getSourceUid(document);
        if (sourceUid && /^\s*derived\s*:/i.test(document.lineAt(line).text)) {
          lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
            command: 'doorstop.deriveRequirement',
            title: '+ Derive Requirement',
            arguments: [{
              sourceUid,
              sourceUri: document.uri
            } satisfies DeriveCommandContext]
          }));
        }
      }
      return lenses;
    }
  };

  const command = vscode.commands.registerCommand(
    'doorstop.deriveRequirement',
    async (deriveContext: DeriveCommandContext) => {
      if (!deriveContext?.sourceUid) {
        void vscode.window.showErrorMessage('The source requirement UID could not be determined.');
        return;
      }

      const documents = await getDocuments(options.workspaceFolder);
      const sourcePrefix = getSourceDocumentPrefix(deriveContext.sourceUri, documents);
      if (!sourcePrefix) {
        void vscode.window.showWarningMessage('The source document is not inside a Doorstop document.');
        return;
      }
      const prefixes = getSameLevelAndBelowPrefixes(sourcePrefix, documents);
      if (prefixes.length === 0) {
        void vscode.window.showWarningMessage(`No child documents found below ${sourcePrefix}.`);
        return;
      }

      const target = await vscode.window.showQuickPick(prefixes, {
        placeHolder: 'Select the target Doorstop document'
      });
      if (!target) {
        return;
      }

      try {
        const pythonPath = await options.getPythonPath();
        const commonArgs = [
          '--project', options.workspaceFolder.uri.fsPath,
          '--server', DOORSTOP_SERVER_HOST,
          '--port', String(DOORSTOP_SERVER_PORT)
        ];
        const addResult = await options.server.runCommand(
          options.workspaceFolder.uri.fsPath,
          pythonPath,
          ['add', target, ...commonArgs]
        );
        if (addResult.exitCode !== 0) {
          throw new Error(addResult.stderr.trim() || addResult.stdout.trim() || 'doorstop add failed.');
        }

        const childUid = parseAddedUid(addResult.stdout);
        if (!childUid) {
          throw new Error('doorstop add succeeded but returned no generated item UID.');
        }

        const linkResult = await options.server.runCommand(
          options.workspaceFolder.uri.fsPath,
          pythonPath,
          ['link', childUid, deriveContext.sourceUid, ...commonArgs]
        );
        if (linkResult.exitCode !== 0) {
          throw new Error(linkResult.stderr.trim() || linkResult.stdout.trim() || 'doorstop link failed.');
        }

        options.onChanged?.();
        void vscode.window.showInformationMessage(`${childUid} was derived from ${deriveContext.sourceUid}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not derive requirement: ${message}`);
      }
    }
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: 'yaml' }, { language: 'markdown' }],
      provider
    ),
    command
  );
}
