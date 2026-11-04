import * as assert from 'assert';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { AttachmentProvider, ItemLocation, setObjectStorageCredentials, storeInAssets } from '../attachments';
import { putObject, signV4 } from '../objectStorage';
import { setProgressForTest } from '../progress';

// Paste/drop attachments (spec 035 US2, US3). No workspace folder, no Doorstop
// server and no network: each test gets a temp Doorstop document, `locate` points
// straight at it, and object storage is a node:http server on port 0.

const ITEM = 'active: true\ntext: |\n  - [ ] step\n\n';
/** Line 3 of ITEM: blank, inside the text block. */
const BLANK = new vscode.Position(3, 0);

let root: string;
let counter = 0;
/** What the fake secret storage holds. */
const secrets = new Map<string, string>();

class FileItem extends vscode.DataTransferItem {
  constructor(private readonly file: vscode.DataTransferFile) {
    super('');
  }
  override asFile(): vscode.DataTransferFile {
    return this.file;
  }
}

interface Fixture {
  document: vscode.TextDocument;
  docFolder: string;
  assets: string;
  provider: AttachmentProvider;
  source: (name: string, content: string) => string;
}

async function fixture(locate?: (uid: string) => Promise<ItemLocation | undefined>): Promise<Fixture> {
  const docFolder = path.join(root, `DOC${++counter}`);
  fs.mkdirSync(docFolder, { recursive: true });
  fs.writeFileSync(path.join(docFolder, '.doorstop.yml'), 'settings:\n  prefix: TR\n');
  const item = path.join(docFolder, 'TR-001.yml');
  fs.writeFileSync(item, ITEM);
  const sources = path.join(root, `src${counter}`);
  fs.mkdirSync(sources);
  return {
    document: await vscode.workspace.openTextDocument(item),
    docFolder,
    assets: path.join(docFolder, 'assets'),
    provider: new AttachmentProvider({
      locate: locate ?? (async () => ({ documentFolder: docFolder, itemFolder: docFolder })),
      secrets: { get: async key => secrets.get(key) }
    }),
    source: (name, content) => {
      const file = path.join(sources, name);
      fs.writeFileSync(file, content);
      return file;
    }
  };
}

function uriList(...files: string[]): vscode.DataTransfer {
  const transfer = new vscode.DataTransfer();
  transfer.set('text/uri-list', new vscode.DataTransferItem(files.map(file => vscode.Uri.file(file).toString()).join('\r\n')));
  return transfer;
}

const token = () => new vscode.CancellationTokenSource().token;

async function drop(f: Fixture, transfer: vscode.DataTransfer, position = BLANK, cancel = token()): Promise<string | undefined> {
  const edit = await f.provider.provideDocumentDropEdits(f.document, position, transfer);
  if (!edit) {
    return undefined;
  }
  const resolved = await f.provider.resolveDocumentDropEdit(edit, cancel);
  return typeof resolved.insertText === 'string' ? resolved.insertText : resolved.insertText?.value;
}

const listAssets = (f: Fixture) => (fs.existsSync(f.assets) ? fs.readdirSync(f.assets).sort() : []);

/** Records messages instead of showing them. */
function captureMessages(): { errors: string[]; warnings: string[]; restore: () => void } {
  const original = { showErrorMessage: vscode.window.showErrorMessage, showWarningMessage: vscode.window.showWarningMessage };
  const captured = { errors: [] as string[], warnings: [] as string[] };
  Object.assign(vscode.window, {
    showErrorMessage: async (message: string) => { captured.errors.push(message); return undefined; },
    showWarningMessage: async (message: string) => { captured.warnings.push(message); return undefined; }
  });
  return { ...captured, restore: () => Object.assign(vscode.window, original) };
}

suite('Attachments (035)', function () {
  this.timeout(20000);
  let messages: ReturnType<typeof captureMessages>;

  suiteSetup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-035-attach-'));
  });

  setup(() => {
    messages = captureMessages();
  });

  teardown(() => {
    messages.restore();
  });

  // Spec 035 FR-006, FR-008, FR-012
  test('dropped files land in the document\'s assets folder, linked in order and indented', async () => {
    const f = await fixture();
    const text = await drop(f, uriList(f.source('a.png', 'PNG'), f.source('b.log', 'log')));
    assert.strictEqual(text, '  ![a.png](assets/a.png)\n  [b.log](assets/b.log)');
    assert.deepStrictEqual(listAssets(f), ['a.png', 'b.log']);
    assert.strictEqual(fs.readFileSync(path.join(f.assets, 'b.log'), 'utf8'), 'log');
  });

  // Spec 035 FR-006, FR-007
  test('the Doorstop edit is the preferred paste and drop in YAML and markdown', () => {
    for (const languageId of ['yaml', 'markdown']) {
      const editor = vscode.workspace.getConfiguration('editor', { languageId });
      assert.deepStrictEqual(editor.get('pasteAs.preferences'), ['markdown.link.doorstop'], languageId);
      assert.deepStrictEqual(editor.get('dropIntoEditor.preferences'), ['markdown.link.doorstop'], languageId);
    }
  });

  // Spec 035 FR-012
  test('links are relative to the item and encode spaces and non-ASCII names', async () => {
    const f = await fixture(async () => ({ documentFolder: root, itemFolder: path.join(root, `DOC${counter}`) }));
    const text = await drop(f, uriList(f.source('my shot ä.png', 'x')), new vscode.Position(2, 12));
    assert.strictEqual(text, '![my shot ä.png](../assets/my%20shot%20%C3%A4.png)');
    assert.ok(fs.existsSync(path.join(root, 'assets', 'my shot ä.png')));
  });

  // Spec 035 FR-007
  test('pasted files and clipboard images are stored like dropped ones', async () => {
    const f = await fixture();
    const transfer = uriList(f.source('c.txt', 'c'));
    transfer.set('image/png', new FileItem({ name: 'image.png', uri: undefined, data: async () => new Uint8Array([1, 2, 3]) }));
    const [edit] = (await f.provider.provideDocumentPasteEdits(f.document, [new vscode.Range(BLANK, BLANK)], transfer)) ?? [];
    const resolved = await f.provider.resolveDocumentPasteEdit(edit, token());
    const [linkC, linkImage] = String(resolved.insertText).split('\n  ');
    assert.strictEqual(linkC, '  [c.txt](assets/c.txt)');
    assert.match(linkImage, /^!\[paste-\d{8}-\d{6}\.png\]\(assets\/paste-\d{8}-\d{6}\.png\)$/);
    const image = listAssets(f).find(name => name.startsWith('paste-'));
    assert.deepStrictEqual([...fs.readFileSync(path.join(f.assets, image ?? ''))], [1, 2, 3]);
  });

  // Spec 035 FR-009
  test('plain text, or files dropped outside the item text, keep the default behavior', async () => {
    const f = await fixture();
    const text = new vscode.DataTransfer();
    text.set('text/plain', new vscode.DataTransferItem('just text'));
    assert.strictEqual(await f.provider.provideDocumentDropEdits(f.document, BLANK, text), undefined);
    assert.strictEqual(await f.provider.provideDocumentPasteEdits(f.document, [new vscode.Range(BLANK, BLANK)], text), undefined);
    assert.strictEqual(await drop(f, uriList(f.source('a.png', 'x')), new vscode.Position(0, 3)), undefined, 'on metadata');
    assert.deepStrictEqual(listAssets(f), []);
  });

  // Spec 035 FR-010
  test('a dropped folder is refused by name; the files beside it are still stored', async () => {
    const f = await fixture();
    const folder = path.join(root, `folder${counter}`);
    fs.mkdirSync(folder);
    const text = await drop(f, uriList(folder, f.source('a.log', 'x')));
    assert.strictEqual(text, '  [a.log](assets/a.log)');
    assert.deepStrictEqual(messages.warnings, [`"folder${counter}" is a folder; only files can be attached.`]);
    assert.deepStrictEqual(listAssets(f), ['a.log']);
  });

  // Spec 035 FR-013
  test('an identical file is reused; a different one with the same name never overwrites', async () => {
    const f = await fixture();
    fs.mkdirSync(f.assets);
    fs.writeFileSync(path.join(f.assets, 'a.png'), 'same');
    assert.strictEqual(await drop(f, uriList(f.source('a.png', 'same'))), '  ![a.png](assets/a.png)');
    assert.deepStrictEqual(listAssets(f), ['a.png']);
    assert.strictEqual(await drop(f, uriList(f.source('a.png', 'other'))), '  ![a-1.png](assets/a-1.png)');
    assert.strictEqual(await drop(f, uriList(f.source('a.png', 'third'))), '  ![a-2.png](assets/a-2.png)');
    assert.strictEqual(fs.readFileSync(path.join(f.assets, 'a.png'), 'utf8'), 'same');
    assert.deepStrictEqual(listAssets(f), ['a-1.png', 'a-2.png', 'a.png']);
  });

  // Spec 035 FR-018
  test('cancelling inserts no link and leaves no partial or new file', async () => {
    const f = await fixture();
    const cancelled = new vscode.CancellationTokenSource();
    cancelled.cancel();
    assert.strictEqual(await drop(f, uriList(f.source('a.png', 'x')), BLANK, cancelled.token), '');
    await assert.rejects(storeInAssets({ name: 'b.png', bytes: new Uint8Array([1]) }, 1, f.assets, () => true));
    assert.deepStrictEqual(listAssets(f), []);
  });

  // Spec 035 FR-019
  test('a failed file is named in one error, the others are linked, nothing partial remains', async () => {
    const f = await fixture();
    const gone = f.source('gone.log', 'x');
    const transfer = uriList(gone, f.source('ok.log', 'y'));
    fs.rmSync(gone);
    assert.strictEqual(await drop(f, transfer), '  [ok.log](assets/ok.log)');
    assert.strictEqual(messages.errors.length, 1);
    assert.match(messages.errors[0], /^Could not attach: "gone\.log" \(/);
    assert.deepStrictEqual(listAssets(f), ['ok.log']);
  });

  // Spec 035 FR-009
  test('a file the server does not know as an item, or no server at all, gets no attachment edit', async () => {
    const unknown = await fixture(async () => undefined);
    const files = uriList(unknown.source('a.log', 'x'));
    assert.strictEqual(await unknown.provider.provideDocumentDropEdits(unknown.document, BLANK, files), undefined);
    assert.strictEqual(await unknown.provider.provideDocumentPasteEdits(unknown.document, [new vscode.Range(BLANK, BLANK)], files), undefined);
    assert.deepStrictEqual(listAssets(unknown), []);
    assert.deepStrictEqual(messages.errors, [], 'the editor\'s own paste applies, without an error');
  });
});

interface Received {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  bytes: number;
}

/** A fake S3 endpoint: records each request, answers with `respond`. */
async function fakeS3(respond: (response: http.ServerResponse) => void): Promise<{ endpoint: string; received: Received[]; close: () => void }> {
  const received: Received[] = [];
  const server = http.createServer((request, response) => {
    const entry: Received = { method: request.method, url: request.url, headers: request.headers, bytes: 0 };
    received.push(entry);
    request.on('data', (chunk: Buffer) => { entry.bytes += chunk.length; });
    request.on('end', () => respond(response));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close: () => { server.closeAllConnections(); server.close(); }
  };
}

const MB = 1024 * 1024;

async function configure(values: Record<string, unknown>): Promise<void> {
  const settings = vscode.workspace.getConfiguration('doorstop.attachments');
  for (const [key, value] of Object.entries(values)) {
    await settings.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

const STORAGE_KEYS = ['storage', 'objectStorage.thresholdMB', 'objectStorage.endpoint', 'objectStorage.bucket', 'objectStorage.prefix', 'objectStorage.publicUrl'];

suite('Attachments: object storage (035)', function () {
  this.timeout(20000);
  let messages: ReturnType<typeof captureMessages>;
  let s3: Awaited<ReturnType<typeof fakeS3>> | undefined;

  suiteSetup(() => {
    root ??= fs.mkdtempSync(path.join(os.tmpdir(), 'doorstop-035-attach-'));
  });

  setup(() => {
    messages = captureMessages();
    secrets.set('doorstop.objectStorage.accessKey', 'minioadmin');
    secrets.set('doorstop.objectStorage.secretKey', 'minio-secret');
  });

  teardown(async () => {
    messages.restore();
    setProgressForTest(undefined);
    s3?.close();
    s3 = undefined;
    secrets.clear();
    await configure(Object.fromEntries(STORAGE_KEYS.map(key => [key, undefined])));
  });

  // Spec 035 FR-016
  test('signV4 reproduces the AWS documentation example for PUT Object', () => {
    const payloadHash = crypto.createHash('sha256').update('Welcome to Amazon S3.').digest('hex');
    assert.strictEqual(payloadHash, '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    const authorization = signV4({
      method: 'PUT',
      path: '/test%24file.text',
      query: '',
      headers: {
        Host: 'examplebucket.s3.amazonaws.com',
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-date': '20130524T000000Z',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
        'x-amz-content-sha256': payloadHash
      },
      payloadHash,
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      amzDate: '20130524T000000Z'
    });
    assert.strictEqual(authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
      + 'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, '
      + 'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  // Spec 035 FR-015, FR-016
  test('a file above the threshold is PUT, signed, to the bucket and linked by its object URL', async () => {
    s3 = await fakeS3(response => response.writeHead(200).end());
    await configure({ storage: 'objectStorage', 'objectStorage.thresholdMB': 1, 'objectStorage.endpoint': s3.endpoint, 'objectStorage.bucket': 'reports', 'objectStorage.prefix': 'runs/' });
    const f = await fixture();
    const text = await drop(f, uriList(f.source('big run.bin', 'x'.repeat(2 * MB))));
    const [request] = s3.received;
    assert.strictEqual(request.method, 'PUT');
    assert.match(request.url ?? '', /^\/reports\/runs\/TR-001\/\d{8}-\d{6}-big%20run\.bin$/);
    assert.strictEqual(request.headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
    assert.match(String(request.headers.authorization), /^AWS4-HMAC-SHA256 Credential=minioadmin\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.strictEqual(request.bytes, 2 * MB);
    assert.strictEqual(text, `  [big run.bin](${s3.endpoint}${request.url})`);
    assert.deepStrictEqual(listAssets(f), [], 'nothing in the repository');
  });

  // Spec 035 FR-015
  test('with a public base URL the link points there while the upload still goes to the endpoint', async () => {
    s3 = await fakeS3(response => response.writeHead(200).end());
    await configure({
      storage: 'objectStorage', 'objectStorage.thresholdMB': 0, 'objectStorage.endpoint': s3.endpoint,
      'objectStorage.bucket': 'reports', 'objectStorage.prefix': 'runs/', 'objectStorage.publicUrl': 'http://public.example/'
    });
    const f = await fixture();
    const text = await drop(f, uriList(f.source('big run.bin', 'x')));
    const [request] = s3.received;
    assert.match(request.url ?? '', /^\/reports\/runs\/TR-001\/\d{8}-\d{6}-big%20run\.bin$/);
    assert.strictEqual(text, `  [big run.bin](http://public.example${request.url?.replace('/reports', '')})`, 'no double slash, no bucket in the path');
  });

  // Spec 035 FR-019
  test('a rejected upload is reported with the S3 error code and message and leaves no link and no file', async () => {
    s3 = await fakeS3(response => response.writeHead(403).end('<Error><Code>AccessDenied</Code><Message>Access Denied.</Message></Error>'));
    await configure({ storage: 'objectStorage', 'objectStorage.thresholdMB': 0, 'objectStorage.endpoint': s3.endpoint, 'objectStorage.bucket': 'reports' });
    const f = await fixture();
    assert.strictEqual(await drop(f, uriList(f.source('a.log', 'x'))), '');
    assert.deepStrictEqual(messages.errors, ['Could not attach: "a.log" (403 AccessDenied: Access Denied.)']);
    assert.deepStrictEqual(listAssets(f), []);
    await assert.rejects(putObject({ endpoint: s3.endpoint, bucket: 'b', key: 'k', region: 'us-east-1', accessKey: 'a', secretKey: 's', size: 1, body: new Uint8Array([1]) }, token()), /403 AccessDenied/);
  });

  // Spec 035 FR-011, FR-014
  test('the storage mode and threshold decide per file where it goes', async () => {
    s3 = await fakeS3(response => response.writeHead(200).end());
    const f = await fixture();
    const small = f.source('small.bin', 'x'.repeat(100 * 1024));
    const big = f.source('big.bin', 'x'.repeat(2 * MB));
    await configure({ 'objectStorage.thresholdMB': 1, 'objectStorage.endpoint': s3.endpoint, 'objectStorage.bucket': 'reports' });
    await drop(f, uriList(small, big));
    assert.deepStrictEqual(listAssets(f), ['big.bin', 'small.bin'], 'assets mode keeps every file in the repository');
    assert.strictEqual(s3.received.length, 0);

    const g = await fixture();
    await configure({ storage: 'objectStorage' });
    await drop(g, uriList(small, big));
    assert.deepStrictEqual(listAssets(g), ['small.bin']);
    assert.deepStrictEqual(s3.received.map(request => request.bytes), [2 * MB]);

    const h = await fixture();
    await configure({ 'objectStorage.thresholdMB': 0 });
    await drop(h, uriList(small));
    assert.deepStrictEqual(listAssets(h), []);
    assert.strictEqual(s3.received.length, 2, 'threshold 0 uploads every file');
  });

  // Spec 035 FR-017
  test('credentials are trimmed, the secret key is hidden, and both are kept in secret storage only when both are given', async () => {
    const original = vscode.window.showInputBox;
    const answers: (string | undefined)[] = [' access ', 'secret\n', 'access2', undefined];
    const prompts: vscode.InputBoxOptions[] = [];
    Object.assign(vscode.window, { showInputBox: async (options: vscode.InputBoxOptions) => { prompts.push(options); return answers.shift(); } });
    try {
      const stored = new Map<string, string>();
      const storage = { store: async (key: string, value: string) => { stored.set(key, value); } };
      await setObjectStorageCredentials(storage);
      assert.deepStrictEqual([...stored], [['doorstop.objectStorage.accessKey', 'access'], ['doorstop.objectStorage.secretKey', 'secret']]);
      assert.deepStrictEqual(prompts.map(prompt => prompt.password === true), [false, true], 'only the secret key is masked');
      await setObjectStorageCredentials(storage);
      assert.strictEqual(stored.get('doorstop.objectStorage.accessKey'), 'access', 'Esc on the second box changes nothing');
      const settings = vscode.workspace.getConfiguration('doorstop.attachments');
      assert.ok(!JSON.stringify(settings).includes('secret'), 'nothing lands in settings');
    } finally {
      Object.assign(vscode.window, { showInputBox: original });
    }
  });

  // Spec 035 FR-018
  test('a slow upload shows a cancellable notification; cancel aborts it and inserts nothing', async () => {
    s3 = await fakeS3(response => { setTimeout(() => response.writeHead(200).end(), 10000); });
    await configure({ storage: 'objectStorage', 'objectStorage.thresholdMB': 0, 'objectStorage.endpoint': s3.endpoint, 'objectStorage.bucket': 'reports' });
    const shown: { options: vscode.ProgressOptions; messages: string[] }[] = [];
    setProgressForTest(async (options, task) => {
      const call = { options, messages: [] as string[] };
      shown.push(call);
      const cancel = new vscode.CancellationTokenSource();
      setTimeout(() => cancel.cancel(), 200);
      return task({ report: value => { call.messages.push(value.message ?? ''); } }, cancel.token);
    });
    const f = await fixture();
    assert.strictEqual(await drop(f, uriList(f.source('slow.log', 'x'))), '');
    assert.strictEqual(shown.length, 1);
    assert.strictEqual(shown[0].options.title, 'Storing attachments…');
    assert.strictEqual(shown[0].options.cancellable, true);
    assert.deepStrictEqual(shown[0].messages, ['Uploading "slow.log"…']);
    assert.deepStrictEqual(messages.errors, [], 'a cancel is no failure');
  });

  // Bug endpoint-setting-scope: a workspace must not choose where the user's credentials are sent.
  test('endpoint and region are machine-scoped; the other attachment settings stay resource', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    const properties = manifest.contributes.configuration
      .map((section: { properties?: Record<string, { scope?: string }> }) => section.properties ?? {})
      .reduce((all: Record<string, { scope?: string }>, next: Record<string, { scope?: string }>) => ({ ...all, ...next }), {});
    const scopes = Object.fromEntries(Object.keys(properties)
      .filter(key => key.startsWith('doorstop.attachments.'))
      .map(key => [key.slice('doorstop.attachments.'.length), properties[key].scope]));
    assert.deepStrictEqual(scopes, {
      storage: 'resource',
      'objectStorage.thresholdMB': 'resource',
      'objectStorage.endpoint': 'machine',
      'objectStorage.bucket': 'resource',
      'objectStorage.prefix': 'resource',
      'objectStorage.publicUrl': 'resource',
      'objectStorage.region': 'machine'
    });
  });

  test('a missing endpoint points the user to User settings', async () => {
    await configure({ storage: 'objectStorage', 'objectStorage.thresholdMB': 0, 'objectStorage.bucket': 'reports' });
    const f = await fixture();
    await drop(f, uriList(f.source('big.bin', 'x')));
    assert.deepStrictEqual(messages.errors, ['Could not attach: "big.bin" (set doorstop.attachments.objectStorage.endpoint in User settings first)']);
  });

  // Spec 035 FR-020
  test('missing storage settings or credentials fail only the files bound for the bucket', async () => {
    await configure({ storage: 'objectStorage', 'objectStorage.thresholdMB': 1, 'objectStorage.endpoint': 'http://127.0.0.1:9' });
    const f = await fixture();
    const text = await drop(f, uriList(f.source('small.log', 'x'), f.source('big.bin', 'x'.repeat(2 * MB))));
    assert.strictEqual(text, '  [small.log](assets/small.log)');
    assert.deepStrictEqual(messages.errors, ['Could not attach: "big.bin" (set doorstop.attachments.objectStorage.bucket first)']);

    await configure({ 'objectStorage.bucket': 'reports' });
    secrets.clear();
    const g = await fixture();
    await drop(g, uriList(g.source('big.bin', 'x'.repeat(2 * MB))));
    assert.strictEqual(messages.errors[1], 'Could not attach: "big.bin" (run "Doorstop: Set Object Storage Credentials" first)');
  });

  // Spec 035 FR-009
  test('a markdown file outside any Doorstop document gets no attachment edit', async () => {
    const folder = path.join(root, `notes${++counter}`);
    fs.mkdirSync(folder);
    const post = path.join(folder, 'post.md');
    fs.writeFileSync(post, '---\ntitle: Post\n---\n\nBody\n');
    const f = await fixture();
    const document = await vscode.workspace.openTextDocument(post);
    const at = new vscode.Position(4, 0);
    const files = uriList(f.source('a.png', 'x'));
    assert.strictEqual(await f.provider.provideDocumentDropEdits(document, at, files), undefined);
    assert.strictEqual(await f.provider.provideDocumentPasteEdits(document, [new vscode.Range(at, at)], files), undefined);
  });
});
