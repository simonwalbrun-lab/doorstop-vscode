import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { TreeResponse } from './doorstopTypes';
import { RequirementTreeItem } from './requirementTree';

export interface DeriveCommandContext {
  sourceUid: string;
  sourceUri: vscode.Uri;
}

/** Accepts either a CodeLens-supplied DeriveCommandContext or a tree view item (right-click/context menu). */
function resolveDeriveContext(arg: unknown): DeriveCommandContext | undefined {
  if (arg instanceof RequirementTreeItem) {
    if (arg.itemData.isDoorstopRoot || !arg.itemData.uid) {
      return undefined;
    }
    return { sourceUid: String(arg.itemData.uid), sourceUri: arg.resourceUri };
  }
  const context = arg as DeriveCommandContext | undefined;
  return context?.sourceUid ? context : undefined;
}

interface DeriveProviderOptions {
  server: DoorstopServer;
  onChanged?: () => void;
}

/**
 * A document as the server reports it. Sourced from GET /tree (the server's own
 * computed truth) rather than globbing and re-parsing .doorstop.yml markers
 * client-side - document discovery, config parsing and hierarchy computation all
 * belong to Doorstop, behind the server. See
 * specs/013-review-suspect-codelenses/research.md section 5.
 */
interface DoorstopDocumentInfo {
  prefix: string;
  parentPrefix?: string;
  itemUids: Set<string>;
}

async function loadDocuments(server: DoorstopServer): Promise<DoorstopDocumentInfo[]> {
  const response = await server.request<TreeResponse>('GET', '/tree');
  return response.documents
    .map(document => ({
      prefix: document.prefix,
      parentPrefix: document.parentPrefix,
      itemUids: new Set(document.items.map(item => item.uid))
    }))
    .sort((left, right) => left.prefix.localeCompare(right.prefix));
}

/** The document that actually owns this item, by UID - not guessed from the file's directory. */
function getSourceDocumentPrefix(sourceUid: string, documents: DoorstopDocumentInfo[]): string | undefined {
  return documents.find(document => document.itemUids.has(sourceUid))?.prefix;
}

/**
 * Which documents to offer as derive targets. This depth ordering is this
 * extension's own UX policy, not a Doorstop concept - but it is computed over
 * server-reported parent/child edges, never over client-parsed ones.
 */
function getSameLevelAndBelowPrefixes(sourcePrefix: string, documents: DoorstopDocumentInfo[]): string[] {
  const parentByPrefix = new Map<string, string>();
  for (const document of documents) {
    if (document.parentPrefix) {
      parentByPrefix.set(document.prefix, document.parentPrefix);
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

/**
 * The derive target documents offered for `sourceUid`, or undefined when the
 * item belongs to no known document. Exported so the choice can be verified
 * without driving the quick pick (src/test/regressionFixture.test.ts).
 */
export async function getDeriveTargetPrefixes(
  server: DoorstopServer,
  sourceUid: string
): Promise<string[] | undefined> {
  const documents = await loadDocuments(server);
  const sourcePrefix = getSourceDocumentPrefix(sourceUid, documents);
  return sourcePrefix ? getSameLevelAndBelowPrefixes(sourcePrefix, documents) : undefined;
}

function getSourceUid(document: vscode.TextDocument): string | undefined {
  const extension = path.extname(document.fileName).toLowerCase();
  if (extension !== '.yml' && extension !== '.md') {
    return undefined;
  }
  return path.basename(document.fileName, extension);
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
    async (arg?: DeriveCommandContext | RequirementTreeItem) => {
      const deriveContext = resolveDeriveContext(arg);
      if (!deriveContext?.sourceUid) {
        void vscode.window.showErrorMessage('The source requirement UID could not be determined.');
        return;
      }

      // An unreachable server used to be swallowed here, silently shortening the
      // target list; report it instead of offering a wrong set of choices.
      let documents: DoorstopDocumentInfo[];
      try {
        documents = await loadDocuments(options.server);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not load Doorstop documents: ${message}`);
        return;
      }

      const sourcePrefix = getSourceDocumentPrefix(deriveContext.sourceUid, documents);
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
        const addResult = await options.server.request<{ uid: string; path: string }>(
          'POST', `/documents/${encodeURIComponent(target)}/items`, {}
        );
        const childUid = addResult.uid;

        await options.server.request(
          'POST', `/items/${encodeURIComponent(childUid)}/links`, { parentUid: deriveContext.sourceUid }
        );

        options.onChanged?.();
        void vscode.window.showInformationMessage(`${childUid} was derived from ${deriveContext.sourceUid}.`);
        await vscode.window.showTextDocument(vscode.Uri.file(addResult.path));
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
