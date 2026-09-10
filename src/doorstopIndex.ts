import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';
import { ItemNode, TreeResponse } from './doorstopTypes';

/**
 * The single client-side view of the Doorstop project, built exclusively from
 * `GET /tree`.
 *
 * Every consumer here (hover, completion, go-to-definition) used to discover
 * items by globbing `**\/*.{yml,md}` and re-parsing the files with `js-yaml`.
 * That duplicated Doorstop's own item/document model in the extension
 * (constitution principles I and II) and was non-deterministic whenever a UID
 * resolved to more than one file - `findFiles(..., 1)` simply returns whichever
 * result comes first. Resolving through one shared index instead also means
 * hover and F12 can no longer disagree about which file a UID points at.
 */

export interface IndexedItem extends ItemNode {
  /** Prefix of the document that owns this item, as the server reports it. */
  documentPrefix: string;
}

export interface IndexedDocument {
  prefix: string;
  parentPrefix?: string;
}

export class DoorstopIndex {
  private constructor(
    private readonly itemByUid: Map<string, IndexedItem>,
    private readonly linkersByUid: Map<string, string[]>,
    readonly documents: IndexedDocument[]
  ) { }

  static fromTree(response: TreeResponse): DoorstopIndex {
    const itemByUid = new Map<string, IndexedItem>();
    const linkersByUid = new Map<string, string[]>();
    const documents: IndexedDocument[] = [];

    for (const document of response.documents) {
      documents.push({ prefix: document.prefix, parentPrefix: document.parentPrefix });
      for (const item of document.items) {
        itemByUid.set(item.uid, { ...item, documentPrefix: document.prefix });
        // Defensive: an older server build may omit `links` entirely.
        for (const link of Array.isArray(item.links) ? item.links : []) {
          const linkers = linkersByUid.get(link.uid);
          if (linkers) {
            linkers.push(item.uid);
          } else {
            linkersByUid.set(link.uid, [item.uid]);
          }
        }
      }
    }
    return new DoorstopIndex(itemByUid, linkersByUid, documents);
  }

  getItem(uid: string): IndexedItem | undefined {
    return this.itemByUid.get(uid);
  }

  has(uid: string): boolean {
    return this.itemByUid.has(uid);
  }

  getPath(uid: string): string | undefined {
    return this.itemByUid.get(uid)?.path;
  }

  getUri(uid: string): vscode.Uri | undefined {
    const itemPath = this.getPath(uid);
    return itemPath ? vscode.Uri.file(itemPath) : undefined;
  }

  /** UIDs of the items that link *to* `uid` (its downstream/derived children). */
  getLinkers(uid: string): string[] {
    return this.linkersByUid.get(uid) ?? [];
  }

  get items(): IndexedItem[] {
    return [...this.itemByUid.values()];
  }
}

/**
 * Loads the index, or `undefined` when the server cannot be reached. Callers
 * degrade gracefully rather than surfacing a modal error on every keystroke or
 * hover; the failure is logged for diagnosis.
 */
export async function loadDoorstopIndex(server: DoorstopServer): Promise<DoorstopIndex | undefined> {
  try {
    return DoorstopIndex.fromTree(await server.request<TreeResponse>('GET', '/tree'));
  } catch (error) {
    console.error(
      '[Doorstop][index] Failed to load tree from server:',
      error instanceof Error ? error.message : String(error)
    );
    return undefined;
  }
}

/**
 * The UID an open requirement file stands for. Derived from the file name
 * because that is Doorstop's own naming rule, then confirmed against the index
 * so a stray file that merely looks like an item is not treated as one.
 */
export function getDocumentUid(document: vscode.TextDocument, index?: DoorstopIndex): string | undefined {
  const extension = path.extname(document.fileName).toLowerCase();
  if (extension !== '.yml' && extension !== '.md') {
    return undefined;
  }
  const uid = path.basename(document.fileName, extension);
  if (index && !index.has(uid)) {
    return undefined;
  }
  return uid;
}

/** The item's display title, using the server's fields in Doorstop's own order of preference. */
export function getItemTitle(item: IndexedItem): string {
  if (item.header?.trim()) {
    return item.header.trim();
  }
  const firstLine = item.text?.trim().split(/\r?\n/)[0]?.trim();
  return firstLine || 'Unnamed requirement';
}
