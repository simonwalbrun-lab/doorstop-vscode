import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { DOCUMENT_VIEW_SCHEME, isViewUri, itemBodyAt, parse } from './documentViewModel';
import { loadDoorstopIndex } from './doorstopIndex';
import { DoorstopServer } from './doorstopServer';
import { inDoorstopDocument, textRange, uidFromItemPath } from './itemFile';
import { encodeKey, putObject } from './objectStorage';
import { withDelayedProgress } from './progress';
import { registerCommand } from './timing';

/**
 * Evidence for test reports (spec 035): files pasted or dropped into an item's
 * text are stored in the document's Doorstop `assets` folder, which `doorstop
 * publish` copies, and linked at the cursor. `provide*` only checks whether an
 * edit applies; storing happens in `resolve*`, which VS Code calls for the edit
 * the user actually picks, so a "Paste as..." preview never writes anything.
 * With `doorstop.attachments.storage: objectStorage`, files above the size
 * threshold are uploaded to an S3-compatible bucket (MinIO) instead.
 */

const ATTACHMENT_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'link', 'doorstop');
const TITLE = 'Insert as Doorstop attachment';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']);
/** Doorstop's `Document.ASSETS`. */
const ASSETS = 'assets';
const ACCESS_KEY_SECRET = 'doorstop.objectStorage.accessKey';
const SECRET_KEY_SECRET = 'doorstop.objectStorage.secretKey';

/** A file from the transfer, before it is stored: a path on disk or clipboard bytes. */
type Pending = { name: string; filePath: string } | { name: string; bytes: Uint8Array };

interface Request {
  /** The edited document, for resource-scoped settings. */
  uri: vscode.Uri;
  uid: string;
  /** Leading text of the first inserted line; the rest are joined with `indent`. */
  prefix: string;
  indent: string;
  pending: Pending[];
  location: ItemLocation;
}

export interface ItemLocation {
  documentFolder: string;
  itemFolder: string;
}

export interface AttachmentOptions {
  /** Where the item and its document live; undefined when the server cannot say. */
  locate: (uid: string) => Promise<ItemLocation | undefined>;
  secrets: Pick<vscode.SecretStorage, 'get'>;
}

class AttachmentDropEdit extends vscode.DocumentDropEdit {
  constructor(readonly request: Request) {
    super('', TITLE, ATTACHMENT_KIND);
  }
}

class AttachmentPasteEdit extends vscode.DocumentPasteEdit {
  constructor(readonly request: Request) {
    super('', TITLE, ATTACHMENT_KIND);
  }
}

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** The item at `position` and how new lines are indented there; undefined outside item text. */
function placeAt(document: vscode.TextDocument, position: vscode.Position): Omit<Request, 'pending' | 'location'> | undefined {
  const lines = document.getText().split(/\r?\n/);
  if (isViewUri(document.uri)) {
    const body = itemBodyAt(parse(lines.join('\n')), position.line);
    return body && { uri: document.uri, uid: body.uid, prefix: '', indent: '' };
  }
  const uid = document.uri.scheme === 'file' && inDoorstopDocument(document.fileName) ? uidFromItemPath(document.fileName) : undefined;
  const range = uid ? textRange(lines, document.fileName.toLowerCase().endsWith('.md')) : undefined;
  if (!uid || !range || position.line < range.start || position.line >= range.end) {
    return undefined;
  }
  // Dropped on a blank or under-indented line of a YAML block: indent it, or the block would end.
  const before = lines[position.line].slice(0, position.character);
  const prefix = before.trim() === '' && before.length < range.indent.length ? range.indent.slice(before.length) : '';
  return { uri: document.uri, uid, prefix, indent: range.indent };
}

/** Files in the transfer, read without touching the disk beyond the clipboard bytes. */
async function pendingFiles(dataTransfer: vscode.DataTransfer): Promise<Pending[]> {
  const pending: Pending[] = [];
  const seen = new Set<string>();
  const addPath = (uri: vscode.Uri) => {
    if (uri.scheme === 'file' && !seen.has(uri.fsPath)) {
      seen.add(uri.fsPath);
      pending.push({ name: path.basename(uri.fsPath), filePath: uri.fsPath });
    }
  };
  const uriList = await dataTransfer.get('text/uri-list')?.asString();
  for (const line of uriList?.split(/\r?\n/) ?? []) {
    if (line.trim() && !line.startsWith('#')) {
      addPath(vscode.Uri.parse(line.trim()));
    }
  }
  for (const [mime, item] of dataTransfer) {
    const file = item.asFile();
    if (!file) {
      continue;
    }
    if (file.uri) {
      addPath(file.uri);
    } else {
      // Clipboard image data has no real name; read it now, the transfer may not outlive provide.
      const extension = path.extname(file.name) || `.${mime.split('/')[1] ?? 'png'}`;
      pending.push({ name: `paste-${timestamp()}${extension}`, bytes: await file.data() });
    }
  }
  return pending;
}

async function sameContent(existing: string, source: Pending, size: number): Promise<boolean> {
  // shortcut: identical-content check reads both files into memory, switch to a streamed hash if huge files land in assets
  if ((await fs.promises.stat(existing)).size !== size) {
    return false;
  }
  const incoming = 'bytes' in source ? Buffer.from(source.bytes) : await fs.promises.readFile(source.filePath);
  return incoming.equals(await fs.promises.readFile(existing));
}

/** Stores `source` under `assets/`, never overwriting; `written` is false when an identical file was reused. */
export async function storeInAssets(
  source: Pending,
  size: number,
  assetsFolder: string,
  cancelled: () => boolean
): Promise<{ filePath: string; written: boolean }> {
  await fs.promises.mkdir(assetsFolder, { recursive: true });
  const extension = path.extname(source.name);
  const stem = path.basename(source.name, extension);
  for (let n = 0; ; n++) {
    const candidate = path.join(assetsFolder, n === 0 ? source.name : `${stem}-${n}${extension}`);
    if (!fs.existsSync(candidate)) {
      // Written under a temporary name first, so a failed or cancelled copy never carries the final one.
      const partial = path.join(assetsFolder, `.${path.basename(candidate)}.partial`);
      try {
        await ('bytes' in source ? fs.promises.writeFile(partial, source.bytes) : fs.promises.copyFile(source.filePath, partial));
        if (cancelled()) {
          throw new vscode.CancellationError();
        }
        await fs.promises.rename(partial, candidate);
      } catch (error) {
        await fs.promises.rm(partial, { force: true });
        throw error;
      }
      return { filePath: candidate, written: true };
    }
    if (await sameContent(candidate, source, size)) {
      return { filePath: candidate, written: false };
    }
  }
}

/** A markdown link from the item's folder, every path segment encoded. */
function linkFor(itemFolder: string, filePath: string): string {
  return path.relative(itemFolder, filePath).split(path.sep).map(encodeURIComponent).join('/');
}

function markdownLink(name: string, link: string): string {
  return `${IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) ? '!' : ''}[${name}](${link})`;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Uploads one file to the configured bucket and returns its URL. */
async function upload(
  source: Pending,
  size: number,
  uid: string,
  settings: vscode.WorkspaceConfiguration,
  secrets: AttachmentOptions['secrets'],
  token: vscode.CancellationToken
): Promise<string> {
  const endpoint = settings.get<string>('objectStorage.endpoint', '');
  const bucket = settings.get<string>('objectStorage.bucket', '');
  const missing = !endpoint ? 'endpoint' : !bucket ? 'bucket' : undefined;
  if (missing) {
    throw new Error(`set doorstop.attachments.objectStorage.${missing} first`);
  }
  // Read per upload, never kept: credentials live only in secret storage (FR-017).
  const [accessKey, secretKey] = await Promise.all([secrets.get(ACCESS_KEY_SECRET), secrets.get(SECRET_KEY_SECRET)]);
  if (!accessKey || !secretKey) {
    throw new Error('run "Doorstop: Set Object Storage Credentials" first');
  }
  const key = `${settings.get<string>('objectStorage.prefix', '')}${uid}/${timestamp()}-${source.name}`;
  const url = await putObject({
    endpoint,
    bucket,
    key,
    region: settings.get<string>('objectStorage.region', 'us-east-1'),
    accessKey,
    secretKey,
    size,
    body: 'bytes' in source ? source.bytes : source.filePath
  }, token);
  // Readers may only reach the files elsewhere, e.g. Garage's website endpoint (FR-015).
  const publicUrl = settings.get<string>('objectStorage.publicUrl', '').replace(/\/+$/, '');
  return publicUrl ? `${publicUrl}/${encodeKey(key)}` : url;
}

/** Stores every pending file and returns the text to insert ('' when nothing is linked). */
async function attach(request: Request, options: AttachmentOptions, token: vscode.CancellationToken): Promise<string> {
  const location = request.location;
  const assetsFolder = path.join(location.documentFolder, ASSETS);
  const links: string[] = [];
  const failures: string[] = [];
  const written: string[] = [];
  const settings = vscode.workspace.getConfiguration('doorstop.attachments', request.uri);
  const thresholdMB = settings.get<number>('objectStorage.thresholdMB', 10);
  const toBucket = (size: number) =>
    settings.get('storage') === 'objectStorage' && (thresholdMB === 0 || size > thresholdMB * 1024 * 1024);
  // Either Cancel (the editor's or the notification's) stops the run, including a running upload.
  const cancellation = new vscode.CancellationTokenSource();
  const forward = token.onCancellationRequested(() => cancellation.cancel());
  if (token.isCancellationRequested) {
    cancellation.cancel();
  }
  const stop = () => cancellation.token.isCancellationRequested;
  const cancelled = await withDelayedProgress('Storing attachments…', async (report, progressToken) => {
    progressToken.onCancellationRequested(() => cancellation.cancel());
    for (const source of request.pending) {
      if (stop()) {
        return true;
      }
      try {
        let size: number;
        if ('bytes' in source) {
          size = source.bytes.byteLength;
        } else {
          const stat = await fs.promises.stat(source.filePath);
          if (stat.isDirectory()) {
            void vscode.window.showWarningMessage(`"${source.name}" is a folder; only files can be attached.`);
            continue;
          }
          size = stat.size;
        }
        if (toBucket(size)) {
          report(`Uploading "${source.name}"…`);
          links.push(markdownLink(source.name, await upload(source, size, request.uid, settings, options.secrets, cancellation.token)));
          continue;
        }
        const stored = await storeInAssets(source, size, assetsFolder, stop);
        if (stored.written) {
          written.push(stored.filePath);
        }
        links.push(markdownLink(path.basename(stored.filePath), linkFor(location.itemFolder, stored.filePath)));
      } catch (error) {
        if (stop()) {
          return true;
        }
        failures.push(`"${source.name}" (${reason(error)})`);
      }
    }
    return false;
  }, { cancellable: true }).finally(() => {
    forward.dispose();
    cancellation.dispose();
  });

  if (cancelled) {
    // Nothing gets linked, so nothing stored by this run should stay behind.
    await Promise.all(written.map(file => fs.promises.rm(file, { force: true })));
    return '';
  }
  if (failures.length > 0) {
    void vscode.window.showErrorMessage(`Could not attach: ${failures.join(', ')}`);
  }
  return links.length > 0 ? request.prefix + links.join(`\n${request.indent}`) : '';
}

export class AttachmentProvider implements vscode.DocumentDropEditProvider<AttachmentDropEdit>, vscode.DocumentPasteEditProvider<AttachmentPasteEdit> {
  constructor(private readonly options: AttachmentOptions) { }

  private async request(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer): Promise<Request | undefined> {
    const place = placeAt(document, position);
    if (!place) {
      return undefined;
    }
    const pending = await pendingFiles(dataTransfer);
    // Only items the server knows: a file that merely looks like one keeps the editor's own paste (FR-009).
    const location = pending.length > 0 ? await this.options.locate(place.uid) : undefined;
    return location && { ...place, pending, location };
  }

  async provideDocumentDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer): Promise<AttachmentDropEdit | undefined> {
    const request = await this.request(document, position, dataTransfer);
    return request && new AttachmentDropEdit(request);
  }

  async resolveDocumentDropEdit(edit: AttachmentDropEdit, token: vscode.CancellationToken): Promise<AttachmentDropEdit> {
    edit.insertText = await attach(edit.request, this.options, token);
    return edit;
  }

  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer
  ): Promise<AttachmentPasteEdit[] | undefined> {
    const request = ranges.length > 0 ? await this.request(document, ranges[0].start, dataTransfer) : undefined;
    return request && [new AttachmentPasteEdit(request)];
  }

  async resolveDocumentPasteEdit(edit: AttachmentPasteEdit, token: vscode.CancellationToken): Promise<AttachmentPasteEdit> {
    edit.insertText = await attach(edit.request, this.options, token);
    return edit;
  }
}

/**
 * Asks for both keys; stores them only when both were entered (FR-017). The
 * access key is an ID, not a secret, so it stays visible: a swapped pair shows.
 */
export async function setObjectStorageCredentials(secrets: Pick<vscode.SecretStorage, 'store'>): Promise<void> {
  const accessKey = (await vscode.window.showInputBox({
    title: 'Object storage access key (1/2)',
    prompt: 'The user name, e.g. MinIO\'s MINIO_ROOT_USER or an access key created in its console',
    ignoreFocusOut: true
  }))?.trim();
  if (!accessKey) {
    return;
  }
  const secretKey = (await vscode.window.showInputBox({
    title: 'Object storage secret key (2/2)',
    prompt: 'The password, e.g. MinIO\'s MINIO_ROOT_PASSWORD or the secret key shown with the access key',
    password: true,
    ignoreFocusOut: true
  }))?.trim();
  if (!secretKey) {
    return;
  }
  await secrets.store(ACCESS_KEY_SECRET, accessKey);
  await secrets.store(SECRET_KEY_SECRET, secretKey);
}

export function registerAttachments(context: vscode.ExtensionContext, options: { server: DoorstopServer }): void {
  const provider = new AttachmentProvider({
    secrets: context.secrets,
    locate: async uid => {
      const index = await loadDoorstopIndex(options.server);
      const item = index?.getItem(uid);
      const document = item && index?.getDocument(item.documentPrefix);
      return item && document ? { documentFolder: path.dirname(document.markerPath), itemFolder: path.dirname(item.path) } : undefined;
    }
  });
  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'yaml' },
    { scheme: 'file', language: 'markdown' },
    { scheme: DOCUMENT_VIEW_SCHEME }
  ];
  const mimeTypes = ['text/uri-list', 'files'];
  context.subscriptions.push(
    registerCommand('doorstop.setObjectStorageCredentials', () => setObjectStorageCredentials(context.secrets)),
    vscode.languages.registerDocumentDropEditProvider(selector, provider, { providedDropEditKinds: [ATTACHMENT_KIND], dropMimeTypes: mimeTypes }),
    vscode.languages.registerDocumentPasteEditProvider(selector, provider, { providedPasteEditKinds: [ATTACHMENT_KIND], pasteMimeTypes: mimeTypes })
  );
}
