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
 * How a candidate document is related to the source item's document, in family
 * terms. Only `child` produces a link Doorstop considers canonical - it checks
 * `document.parent` against the linked item's document and otherwise reports
 * `parent is '{prefix}', but linked to: {uid}`. The other relationships stay on
 * offer deliberately (see below), so naming them is what lets the user tell a
 * direct derivation apart from a deliberate cross-branch one before clicking.
 */
export type DocumentRelationship = 'child' | 'grandchild' | 'sibling' | 'nephew' | 'cousin' | 'related';

/** Presentation order of the quick pick: closest and most canonical first. */
const RELATIONSHIP_ORDER: DocumentRelationship[] = [
  'child', 'grandchild', 'sibling', 'nephew', 'cousin', 'related'
];

export interface DeriveTarget {
  prefix: string;
  relationship: DocumentRelationship;
}

/** Just the hierarchy edge of a document - all `buildDeriveTargets` needs from `/tree`. */
export interface DocumentHierarchyNode {
  prefix: string;
  parentPrefix?: string;
}

function buildParentMap(documents: readonly DocumentHierarchyNode[]): Map<string, string> {
  const parentByPrefix = new Map<string, string>();
  for (const document of documents) {
    if (document.parentPrefix) {
      parentByPrefix.set(document.prefix, document.parentPrefix);
    }
  }
  return parentByPrefix;
}

/** `[prefix, parent, grandparent, ... root]`. Stops on a cycle rather than looping. */
function getAncestorChain(prefix: string, parentByPrefix: Map<string, string>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = prefix;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = parentByPrefix.get(current);
  }
  return chain;
}

/**
 * Classifies a document by where it sits relative to the source, using the two
 * distances to their lowest common ancestor: `up` steps from the source, `down`
 * steps from the target. That is exactly how kinship terms are defined, so the
 * usual words fall out of it - up 0 is a descendant line, up 1 the source's own
 * sibling line, up 2 and matching down a cousin line. Anything further out has
 * no everyday name and is reported as `related`.
 */
export function describeRelationship(
  sourcePrefix: string,
  targetPrefix: string,
  parentByPrefix: Map<string, string>
): DocumentRelationship {
  const sourceChain = getAncestorChain(sourcePrefix, parentByPrefix);
  const stepsUpTo = new Map(sourceChain.map((prefix, index) => [prefix, index]));

  const targetChain = getAncestorChain(targetPrefix, parentByPrefix);
  for (let down = 0; down < targetChain.length; down++) {
    const up = stepsUpTo.get(targetChain[down]);
    if (up === undefined) {
      continue;
    }
    if (up === 0) {
      return down === 1 ? 'child' : down === 2 ? 'grandchild' : 'related';
    }
    if (up === 1) {
      return down === 1 ? 'sibling' : down === 2 ? 'nephew' : 'related';
    }
    // Second cousins and beyond are still "cousin" - the word stays useful, and
    // the extra precision would not change the user's decision.
    return down === up ? 'cousin' : 'related';
  }
  // No common ancestor at all: separate root documents in the same project.
  return 'related';
}

/**
 * Which documents to offer as derive targets, each labelled with its kinship to
 * the source. The candidate *set* is unchanged: every document at the source's
 * depth or below, which is this extension's own UX policy rather than a Doorstop
 * concept, and deliberately wider than 005 FR-003's "valid children" so
 * cross-branch derivation stays possible. What is new is that the user is told
 * which is which instead of being handed a bare list of prefixes.
 *
 * Computed over server-reported parent/child edges, never client-parsed ones.
 */
export function buildDeriveTargets(
  sourcePrefix: string,
  documents: readonly DocumentHierarchyNode[]
): DeriveTarget[] {
  const parentByPrefix = buildParentMap(documents);

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
    .map(document => ({
      prefix: document.prefix,
      relationship: describeRelationship(sourcePrefix, document.prefix, parentByPrefix)
    }))
    .sort((left, right) =>
      RELATIONSHIP_ORDER.indexOf(left.relationship) - RELATIONSHIP_ORDER.indexOf(right.relationship)
      || left.prefix.localeCompare(right.prefix));
}

/**
 * The derive targets offered for `sourceUid`, or undefined when the item belongs
 * to no known document. Exported so the choice can be verified without driving
 * the quick pick (src/test/regressionFixture.test.ts).
 */
export async function getDeriveTargets(
  server: DoorstopServer,
  sourceUid: string
): Promise<DeriveTarget[] | undefined> {
  const documents = await loadDocuments(server);
  const sourcePrefix = getSourceDocumentPrefix(sourceUid, documents);
  return sourcePrefix ? buildDeriveTargets(sourcePrefix, documents) : undefined;
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
      const targets = buildDeriveTargets(sourcePrefix, documents);
      if (targets.length === 0) {
        void vscode.window.showWarningMessage(`No child documents found below ${sourcePrefix}.`);
        return;
      }

      // label = the document to derive into, description = how it relates to the
      // source document, so the list reads "ARCH  child" / "TC  nephew" rather
      // than as an unordered set of prefixes.
      const choice = await vscode.window.showQuickPick(
        targets.map(candidate => ({
          label: candidate.prefix,
          description: candidate.relationship
        })),
        { placeHolder: `Select the target Doorstop document for ${deriveContext.sourceUid}` }
      );
      if (!choice) {
        return;
      }
      const target = choice.label;

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
