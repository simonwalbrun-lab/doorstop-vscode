import * as vscode from 'vscode';

import { findHeaderLocation, findReferenceLocation, UID_REGEX } from './definitionProvider';
import { DoorstopIndex, getDocumentUid, IndexedItem, loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';

/**
 * Doorstop's link graph presented through VS Code's built-in peek call
 * hierarchy (spec 018). Outgoing calls are the items this item links *to*
 * (upstream, its parents); incoming calls are the items that link to it
 * (downstream, its children). Both directions come from the shared
 * `DoorstopIndex`, never from re-parsing files.
 */

interface CallHierarchyProviderOptions {
  server: DoorstopServer;
  /** Overridable so tests can observe the unavailable report without a live UI. */
  reportUnavailable?: (message: string) => void;
}

/** One row of the hierarchy. `uid` lets the expand calls look the item up without parsing `name`. */
export class RequirementHierarchyItem extends vscode.CallHierarchyItem {
  constructor(
    readonly uid: string,
    readonly unresolved: boolean,
    kind: vscode.SymbolKind,
    name: string,
    detail: string,
    uri: vscode.Uri,
    range: vscode.Range
  ) {
    super(kind, name, detail, uri, range, range);
  }
}

/** `UID: Heading`, or the UID alone when the item has no header (spec FR-004). */
export function toCallHierarchyItem(item: IndexedItem, headerLocation: vscode.Location): RequirementHierarchyItem {
  const header = item.header?.trim();
  return new RequirementHierarchyItem(
    item.uid,
    false,
    vscode.SymbolKind.Object,
    header ? `${item.uid}: ${header}` : item.uid,
    item.documentPrefix,
    headerLocation.uri,
    headerLocation.range
  );
}

/**
 * A link whose target the server does not know. It points at the dangling
 * `links:` line in the referencing file - the peek always navigates somewhere
 * on select, and that line is where the user would fix it (spec FR-010).
 */
export function toUnresolvedItem(uid: string, referencingUri: vscode.Uri, linkRange: vscode.Range): RequirementHierarchyItem {
  return new RequirementHierarchyItem(uid, true, vscode.SymbolKind.Null, uid, 'unresolved', referencingUri, linkRange);
}

/** Exported so tests assert the exact wording (spec FR-011). */
export function unavailableMessage(): string {
  return 'Doorstop: call hierarchy is unavailable because the Doorstop server could not be reached.';
}

async function itemFor(uid: string, index: DoorstopIndex): Promise<RequirementHierarchyItem | undefined> {
  const item = index.getItem(uid);
  const uri = index.getUri(uid);
  if (!item || !uri) {
    return undefined;
  }
  return toCallHierarchyItem(item, await findHeaderLocation(uri));
}

/**
 * What the hierarchy roots on: a known UID under the cursor wins, otherwise
 * the file's own item; anything else is not a requirement (spec FR-007).
 */
export async function resolveRootItem(
  document: vscode.TextDocument,
  position: vscode.Position,
  index: DoorstopIndex
): Promise<RequirementHierarchyItem | undefined> {
  const range = document.getWordRangeAtPosition(position, UID_REGEX);
  if (range) {
    const hoveredUid = document.getText(range);
    if (index.has(hoveredUid)) {
      return itemFor(hoveredUid, index);
    }
  }
  const ownUid = getDocumentUid(document, index);
  return ownUid ? itemFor(ownUid, index) : undefined;
}

function logFailure(what: string, error: unknown): void {
  console.error(`[Doorstop][callHierarchy] ${what}:`, error instanceof Error ? error.message : String(error));
}

export function registerCallHierarchyProvider(context: vscode.ExtensionContext, options: CallHierarchyProviderOptions): void {
  const { server } = options;
  const reportUnavailable = options.reportUnavailable
    ?? ((message: string) => void vscode.window.showWarningMessage(message));
  const selector: vscode.DocumentSelector = [{ language: 'yaml' }, { language: 'markdown' }];

  const provider: vscode.CallHierarchyProvider = {
    async prepareCallHierarchy(document, position) {
      try {
        const index = await loadDoorstopIndex(server);
        if (!index) {
          reportUnavailable(unavailableMessage());
          return undefined;
        }
        return await resolveRootItem(document, position, index);
      } catch (error) {
        logFailure('prepare failed', error);
        return undefined;
      }
    },

    // Both expansions derive everything from the item's uid and uri - no cache,
    // no visited set, no depth counter. Each expansion is one lazy lookup, so
    // cycles (A -> B -> A) and items reachable via several parents are simply
    // shown wherever they occur; the widget never auto-expands (spec 018 edge
    // cases). A failed index load here is logged only: prepare has already
    // told the user once, and a warning per expanded node would be noise.

    async provideCallHierarchyOutgoingCalls(item: RequirementHierarchyItem) {
      try {
        if (item.unresolved) {
          return [];
        }
        const index = await loadDoorstopIndex(server);
        const root = index?.getItem(item.uid);
        if (!index || !root) {
          return [];
        }
        const calls: vscode.CallHierarchyOutgoingCall[] = [];
        for (const link of Array.isArray(root.links) ? root.links : []) {
          const fromRange = (await findReferenceLocation(item.uri, link.uid)).range;
          const target = await itemFor(link.uid, index);
          calls.push(new vscode.CallHierarchyOutgoingCall(
            target ?? toUnresolvedItem(link.uid, item.uri, fromRange),
            [fromRange]
          ));
        }
        return calls;
      } catch (error) {
        logFailure(`outgoing calls of ${item.uid} failed`, error);
        return [];
      }
    },

    async provideCallHierarchyIncomingCalls(item: RequirementHierarchyItem) {
      try {
        if (item.unresolved) {
          return [];
        }
        const index = await loadDoorstopIndex(server);
        if (!index) {
          return [];
        }
        const calls: vscode.CallHierarchyIncomingCall[] = [];
        for (const linkerUid of index.getLinkers(item.uid)) {
          const linker = await itemFor(linkerUid, index);
          if (!linker) {
            continue;
          }
          const fromRange = (await findReferenceLocation(linker.uri, item.uid)).range;
          calls.push(new vscode.CallHierarchyIncomingCall(linker, [fromRange]));
        }
        return calls;
      } catch (error) {
        logFailure(`incoming calls of ${item.uid} failed`, error);
        return [];
      }
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCallHierarchyProvider(selector, provider),
    vscode.commands.registerCommand('doorstop.showCallHierarchy', (arg?: unknown) =>
      showCallHierarchy(arg, server, reportUnavailable))
  );
}

/** The shape the tree view hands to its row commands (see doorstop.link / doorstop.review). */
interface TreeItemLike {
  resourceUri?: vscode.Uri;
  itemData?: { uid?: string; isDoorstopRoot?: boolean };
}

function requirementUriFrom(arg: unknown): vscode.Uri | undefined {
  const treeItem = arg as TreeItemLike | undefined;
  if (treeItem?.resourceUri && treeItem.itemData && !treeItem.itemData.isDoorstopRoot) {
    return treeItem.resourceUri;
  }
  const document = vscode.window.activeTextEditor?.document;
  return document && getDocumentUid(document) ? document.uri : undefined;
}

/**
 * The tree row's "calls" icon: open the item on its header line, then the
 * built-in peek, then flip it to outgoing so the user starts upstream (spec
 * FR-003b). `editor.showOutgoingCalls` is a VS Code-side no-op when the peek
 * already opened in that direction, so the sequence is safe either way.
 */
async function showCallHierarchy(
  arg: unknown,
  server: DoorstopServer,
  reportUnavailable: (message: string) => void
): Promise<void> {
  const uri = requirementUriFrom(arg);
  if (!uri) {
    void vscode.window.showInformationMessage('Doorstop: select a requirement in the tree or open a requirement file first.');
    return;
  }
  if (!(await loadDoorstopIndex(server))) {
    reportUnavailable(unavailableMessage());
    return;
  }
  try {
    const header = await findHeaderLocation(uri);
    await vscode.window.showTextDocument(uri, { selection: header.range });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Doorstop: cannot open ${uri.fsPath}: ${reason}`);
    return;
  }
  try {
    await vscode.commands.executeCommand('editor.showCallHierarchy');
    await vscode.commands.executeCommand('editor.showOutgoingCalls');
  } catch (error) {
    logFailure('opening the peek failed', error);
  }
}
