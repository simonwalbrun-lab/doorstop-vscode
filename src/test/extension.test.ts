import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import { registerDefinitionProvider } from '../definitionProvider';
import { DoorstopServer } from '../doorstopServer';
import { TreeResponse } from '../doorstopTypes';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Auto-reveal toggle suppresses reveal on both gated paths', async function () {
		this.timeout(20000);

		const ext = vscode.extensions.getExtension('SimonWalbrun.doorstop');
		assert.ok(ext, 'Doorstop extension should be discoverable');
		const exports = await ext!.activate();
		const treeProvider = exports.treeProvider;
		assert.ok(treeProvider, 'activate() should export treeProvider for tests');

		// Spy on setActiveResource: syncActiveRequirement and the
		// doorstop.activateRequirement handler both call it as their first
		// tree-touching step, strictly after the auto-reveal guard. Counting
		// calls to it (rather than scraping console output, which this
		// environment doesn't let tests intercept) reliably distinguishes
		// "guard short-circuited" from "guard passed" regardless of whether a
		// matching tree item actually exists for the bogus paths used below.
		let calls = 0;
		const original = treeProvider.setActiveResource.bind(treeProvider);
		treeProvider.setActiveResource = (...args: unknown[]) => {
			calls++;
			return original(...args);
		};

		try {
			// Turn auto-reveal off and confirm the diagram/hover-driven path
			// (doorstop.activateRequirement) short-circuits before touching the tree.
			await vscode.commands.executeCommand('doorstop.toggleAutoReveal');
			calls = 0;
			await vscode.commands.executeCommand('doorstop.activateRequirement', 'irrelevant-path.yml');
			assert.strictEqual(calls, 0, 'activateRequirement should short-circuit when auto-reveal is off');

			// Confirm the editor-change path (syncActiveRequirement, which also covers
			// hover-popup link clicks since those change the active editor too) also
			// short-circuits.
			calls = 0;
			const doc = await vscode.workspace.openTextDocument({ content: 'irrelevant', language: 'plaintext' });
			await vscode.window.showTextDocument(doc);
			assert.strictEqual(calls, 0, 'syncActiveRequirement should short-circuit when auto-reveal is off');

			// Turn it back on and confirm both paths proceed past the guard again.
			await vscode.commands.executeCommand('doorstop.enableAutoReveal');
			calls = 0;
			await vscode.commands.executeCommand('doorstop.activateRequirement', 'irrelevant-path.yml');
			assert.ok(calls > 0, 'activateRequirement should proceed past the guard when auto-reveal is on');

			// Opening a document can fire onDidChangeActiveTextEditor more than once
			// (e.g. an intermediate "editor changed to none" event), so assert "at
			// least one call got through" rather than an exact count - the guard
			// only needs to prove it isn't unconditionally blocking.
			calls = 0;
			const doc2 = await vscode.workspace.openTextDocument({ content: 'also irrelevant', language: 'plaintext' });
			await vscode.window.showTextDocument(doc2);
			assert.ok(calls > 0, 'syncActiveRequirement should proceed past the guard when auto-reveal is on');
		} finally {
			treeProvider.setActiveResource = original;
			// Leave the preference in its default state so this test doesn't leak
			// into others.
			await vscode.commands.executeCommand('doorstop.enableAutoReveal');
		}
	});
});

suite('Go to Definition & Usage Navigation', () => {
	let tmpDir: string;
	let subscriptions: vscode.Disposable[];

	setup(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-definition-test-'));

		await fs.writeFile(
			path.join(tmpDir, 'REQ-001.yml'),
			'header: Parent Requirement\nlinks: []\nderived: false\ntext: |\n  Parent text.\n'
		);
		await fs.writeFile(
			path.join(tmpDir, 'REQ-002.yml'),
			'header: Child Requirement\nlinks:\n  - REQ-001\nderived: false\ntext: |\n  Child text.\n'
		);

		const treeResponse: TreeResponse = {
			documents: [{
				prefix: 'REQ',
				markerPath: path.join(tmpDir, '.doorstop.yml'),
				items: [
					{
						uid: 'REQ-001',
						path: path.join(tmpDir, 'REQ-001.yml'),
						level: '1',
						header: 'Parent Requirement',
						active: true,
						normative: true,
						derived: false,
						reviewed: true,
						cleared: true,
						links: []
					},
					{
						uid: 'REQ-002',
						path: path.join(tmpDir, 'REQ-002.yml'),
						level: '2',
						header: 'Child Requirement',
						active: true,
						normative: true,
						derived: false,
						reviewed: true,
						cleared: true,
						links: [{ uid: 'REQ-001', suspect: false }]
					}
				]
			}]
		};

		const fakeServer = { request: async () => treeResponse } as unknown as DoorstopServer;
		const workspaceFolder = { uri: vscode.Uri.file(tmpDir), name: 'test', index: 0 } as vscode.WorkspaceFolder;

		subscriptions = [];
		registerDefinitionProvider({ subscriptions } as unknown as vscode.ExtensionContext, {
			server: fakeServer,
			workspaceFolder
		});
	});

	teardown(async () => {
		subscriptions.forEach(subscription => subscription.dispose());
		// Close any editors left open on files under tmpDir - on Windows, an open
		// editor holds a file handle that makes fs.rm's directory removal race
		// with the OS releasing it.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	});

	test('F12 on non-UID prose text is a no-op', async () => {
		const childUri = vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml'));
		const document = await vscode.workspace.openTextDocument(childUri);
		const proseLine = document.getText().split('\n').findIndex(line => line.includes('Child text.'));
		assert.ok(proseLine >= 0, 'fixture must contain plain prose text');

		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeDefinitionProvider',
			childUri,
			new vscode.Position(proseLine, 2)
		);

		assert.strictEqual(locations?.length ?? 0, 0);
	});

	test('F12 on a linked UID jumps to the target file at its header line', async () => {
		const childUri = vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml'));
		const document = await vscode.workspace.openTextDocument(childUri);
		const linkLine = document.getText().split('\n').findIndex(line => line.includes('REQ-001'));
		assert.ok(linkLine >= 0, 'fixture must contain a REQ-001 reference');

		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeDefinitionProvider',
			childUri,
			new vscode.Position(linkLine, 4)
		);

		assert.strictEqual(locations?.length, 1);
		assert.strictEqual(locations[0].uri.fsPath, vscode.Uri.file(path.join(tmpDir, 'REQ-001.yml')).fsPath);

		const targetDocument = await vscode.workspace.openTextDocument(locations[0].uri);
		assert.ok(targetDocument.lineAt(locations[0].range.start.line).text.startsWith('header:'));
	});

	test('F12 on derived: lists every item that links back to the current requirement', async () => {
		const parentUri = vscode.Uri.file(path.join(tmpDir, 'REQ-001.yml'));
		const document = await vscode.workspace.openTextDocument(parentUri);
		const derivedLine = document.getText().split('\n').findIndex(line => /^\s*derived\s*:/i.test(line));
		assert.ok(derivedLine >= 0, 'fixture must contain a derived: line');

		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeDefinitionProvider',
			parentUri,
			new vscode.Position(derivedLine, 0)
		);

		assert.strictEqual(locations?.length, 1);
		assert.strictEqual(locations[0].uri.fsPath, vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml')).fsPath);

		const referencingDocument = await vscode.workspace.openTextDocument(locations[0].uri);
		assert.ok(referencingDocument.lineAt(locations[0].range.start.line).text.includes('REQ-001'));
	});

	test('Shift+F12 on derived: finds the same usages as F12 (Find All References parity)', async () => {
		const parentUri = vscode.Uri.file(path.join(tmpDir, 'REQ-001.yml'));
		const document = await vscode.workspace.openTextDocument(parentUri);
		const derivedLine = document.getText().split('\n').findIndex(line => /^\s*derived\s*:/i.test(line));
		assert.ok(derivedLine >= 0, 'fixture must contain a derived: line');

		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeReferenceProvider',
			parentUri,
			new vscode.Position(derivedLine, 0)
		);

		assert.strictEqual(locations?.length, 1);
		assert.strictEqual(locations[0].uri.fsPath, vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml')).fsPath);
	});

	test('F12 on derived: for a requirement with no usages reports zero results', async () => {
		const childUri = vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml'));
		const document = await vscode.workspace.openTextDocument(childUri);
		const derivedLine = document.getText().split('\n').findIndex(line => /^\s*derived\s*:/i.test(line));
		assert.ok(derivedLine >= 0, 'fixture must contain a derived: line');

		const locations = await vscode.commands.executeCommand<vscode.Location[]>(
			'vscode.executeDefinitionProvider',
			childUri,
			new vscode.Position(derivedLine, 0)
		);

		assert.strictEqual(locations?.length ?? 0, 0);
	});

	test('Go Back restores the originating file and cursor after jumping via F12', async function () {
		this.timeout(10000);

		const childUri = vscode.Uri.file(path.join(tmpDir, 'REQ-002.yml'));
		const document = await vscode.workspace.openTextDocument(childUri);
		const linkLine = document.getText().split('\n').findIndex(line => line.includes('REQ-001'));
		assert.ok(linkLine >= 0, 'fixture must contain a REQ-001 reference');

		const editor = await vscode.window.showTextDocument(document);
		const linkPosition = new vscode.Position(linkLine, 4);
		editor.selection = new vscode.Selection(linkPosition, linkPosition);

		const waitForActiveEditor = async (predicate: (uri: vscode.Uri) => boolean): Promise<void> => {
			const deadline = Date.now() + 5000;
			while (Date.now() < deadline) {
				const activeUri = vscode.window.activeTextEditor?.document.uri;
				if (activeUri && predicate(activeUri)) {
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.fail('Timed out waiting for the active editor to change as expected');
		};

		await vscode.commands.executeCommand('editor.action.revealDefinition');
		await waitForActiveEditor(uri => uri.fsPath === vscode.Uri.file(path.join(tmpDir, 'REQ-001.yml')).fsPath);

		await vscode.commands.executeCommand('workbench.action.navigateBack');
		await waitForActiveEditor(uri => uri.fsPath === childUri.fsPath);

		assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, linkLine);
	});
});
