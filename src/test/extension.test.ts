import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import { registerDefinitionProvider } from '../definitionProvider';
import { buildDeriveTargets, DocumentHierarchyNode } from '../deriveProvider';
import { DoorstopCommandsProvider } from '../commandsProvider';
import { DoorstopDiagramPanel } from '../diagrammPanel';
import { DoorstopServer } from '../doorstopServer';
import { TreeResponse } from '../doorstopTypes';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	suite('Diagram hot-exit backup recovery (spec 008)', () => {
		const diagramAt = (x: number) => JSON.stringify({ nodes: [{ id: 'REQ-001', x, y: 0 }], edges: [] });
		let dir: string;
		let saved: vscode.Uri;

		setup(async () => {
			dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorstop-backup-'));
			saved = vscode.Uri.file(path.join(dir, 'saved.doorstop.json'));
			await fs.writeFile(saved.fsPath, diagramAt(10));
		});
		teardown(() => fs.rm(dir, { recursive: true, force: true }));

		test('reopens from the backup, not the stale saved file', async () => {
			const backup = vscode.Uri.file(path.join(dir, 'backup.doorstop.json'));
			await fs.writeFile(backup.fsPath, diagramAt(99));
			// backupCustomDocument hands VS Code `destination.toString()` as the id.
			const diagram = await DoorstopDiagramPanel.readDiagramOrBackup(saved, backup.toString());
			assert.strictEqual(diagram.nodes[0].x, 99);
		});

		test('falls back to the saved file when the backup is missing or invalid', async () => {
			const missing = vscode.Uri.file(path.join(dir, 'missing.doorstop.json'));
			const invalid = vscode.Uri.file(path.join(dir, 'invalid.doorstop.json'));
			await fs.writeFile(invalid.fsPath, '{ not json');
			for (const backup of [missing, invalid]) {
				const diagram = await DoorstopDiagramPanel.readDiagramOrBackup(saved, backup.toString());
				assert.strictEqual(diagram.nodes[0].x, 10);
			}
		});
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

suite('Derive Target Kinship', () => {
	// The regression fixture is only two levels deep, so grandchild / nephew /
	// cousin cannot occur there. This pure, synthetic hierarchy is the only place
	// the full taxonomy and its ordering are exercised:
	//
	//                REQ
	//               /   \
	//            SYS     TST
	//           /   \       \
	//        SWE     HWE     TC
	//        /
	//     UNIT
	const HIERARCHY: DocumentHierarchyNode[] = [
		{ prefix: 'REQ' },
		{ prefix: 'SYS', parentPrefix: 'REQ' },
		{ prefix: 'TST', parentPrefix: 'REQ' },
		{ prefix: 'SWE', parentPrefix: 'SYS' },
		{ prefix: 'HWE', parentPrefix: 'SYS' },
		{ prefix: 'TC', parentPrefix: 'TST' },
		{ prefix: 'UNIT', parentPrefix: 'SWE' }
	];

	test('a middle document sees children, grandchildren, siblings and nephews', () => {
		assert.deepStrictEqual(buildDeriveTargets('SYS', HIERARCHY), [
			{ prefix: 'HWE', relationship: 'child' },
			{ prefix: 'SWE', relationship: 'child' },
			{ prefix: 'UNIT', relationship: 'grandchild' },
			{ prefix: 'TST', relationship: 'sibling' },
			{ prefix: 'TC', relationship: 'nephew' }
		]);
	});

	test('a leaf-level document sees its sibling and its cousin', () => {
		assert.deepStrictEqual(buildDeriveTargets('SWE', HIERARCHY), [
			{ prefix: 'UNIT', relationship: 'child' },
			{ prefix: 'HWE', relationship: 'sibling' },
			{ prefix: 'TC', relationship: 'cousin' }
		]);
	});

	test('the root document sees only descendants', () => {
		assert.deepStrictEqual(buildDeriveTargets('REQ', HIERARCHY), [
			{ prefix: 'SYS', relationship: 'child' },
			{ prefix: 'TST', relationship: 'child' },
			{ prefix: 'HWE', relationship: 'grandchild' },
			{ prefix: 'SWE', relationship: 'grandchild' },
			{ prefix: 'TC', relationship: 'grandchild' },
			// UNIT is three levels down: past the words that stay useful.
			{ prefix: 'UNIT', relationship: 'related' }
		]);
	});

	test('the offered set is unchanged - every document at the source depth or below', () => {
		// Option A is deliberately kept: the kinship labels describe the list, they
		// do not filter it. Only the source itself and shallower documents are out.
		const offered = buildDeriveTargets('SWE', HIERARCHY).map(target => target.prefix).sort();
		assert.deepStrictEqual(offered, ['HWE', 'TC', 'UNIT']);
	});

	test('a document in a separate root tree is reported as related, and sorts last', () => {
		const twoRoots: DocumentHierarchyNode[] = [
			...HIERARCHY,
			{ prefix: 'OTHER' },
			{ prefix: 'OTHERCHILD', parentPrefix: 'OTHER' }
		];
		const targets = buildDeriveTargets('SYS', twoRoots);

		assert.deepStrictEqual(
			targets.find(target => target.prefix === 'OTHERCHILD'),
			{ prefix: 'OTHERCHILD', relationship: 'related' }
		);
		assert.strictEqual(
			targets[targets.length - 1].relationship,
			'related',
			'unnamed relationships must sort to the bottom of the quick pick'
		);
	});

	test('a parent cycle in the document config does not hang the quick pick', () => {
		const cyclic: DocumentHierarchyNode[] = [
			{ prefix: 'A', parentPrefix: 'B' },
			{ prefix: 'B', parentPrefix: 'A' },
			{ prefix: 'C', parentPrefix: 'A' }
		];

		const targets = buildDeriveTargets('A', cyclic);

		assert.ok(targets.every(target => target.prefix !== 'A'), 'the source is never its own target');
		assert.ok(targets.length > 0, 'a malformed hierarchy still yields a usable list');
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

suite('Diagram path reconciliation (spec 025)', () => {
	const root = path.join(os.tmpdir(), 'doorstop-025');
	const oldPath = path.join(root, 'a', 'REQ-001.yml');
	const newPath = path.join(root, 'b', 'REQ-001.yml');
	const diagramAt = (fileUri: string) => ({
		nodes: [{ id: 'REQ-001', fileUri, x: 12, y: 34 }],
		edges: [{ from: 'REQ-002', to: 'REQ-001' }]
	});

	test('a moved item gets its new path', () => {
		const input = diagramAt(oldPath);
		const result = DoorstopDiagramPanel.reconcilePaths(input, { 'REQ-001': { path: newPath } });
		assert.deepStrictEqual(result.corrected, [{ uid: 'REQ-001', from: oldPath, to: newPath }]);
		assert.deepStrictEqual(result.unresolved, []);
		assert.strictEqual(result.diagram.nodes[0].fileUri, newPath);
		assert.strictEqual(result.diagram.nodes[0].x, 12);
		assert.strictEqual(result.diagram.nodes[0].y, 34);
		assert.deepStrictEqual(result.diagram.edges, input.edges);
		assert.strictEqual(input.nodes[0].fileUri, oldPath, 'the input diagram is not mutated');
	});

	test('matching paths change nothing and return the same diagram object', () => {
		const input = diagramAt(oldPath);
		const result = DoorstopDiagramPanel.reconcilePaths(input, { 'REQ-001': { path: oldPath } });
		assert.deepStrictEqual(result.corrected, []);
		assert.deepStrictEqual(result.unresolved, []);
		assert.strictEqual(result.diagram, input);
	});

	// The server and path.resolve can disagree on drive-letter case (`c:` vs `C:`);
	// on Windows that must not count as a move, or every open would dirty the diagram.
	test('path case follows the platform: ignored on Windows, significant elsewhere', () => {
		const lower = path.join(root, 'a', 'req-001.yml');
		const upper = path.join(root, 'a', 'REQ-001.yml');
		const input = diagramAt(lower);
		const result = DoorstopDiagramPanel.reconcilePaths(input, { 'REQ-001': { path: upper } });
		if (process.platform === 'win32') {
			assert.deepStrictEqual(result.corrected, []);
			assert.strictEqual(result.diagram, input);
		} else {
			assert.strictEqual(result.corrected.length, 1);
		}
	});

	test('an unknown UID is reported and left untouched', () => {
		const input = { nodes: [{ id: 'NOPE-999', fileUri: oldPath, x: 1, y: 2 }], edges: [] };
		const result = DoorstopDiagramPanel.reconcilePaths(input, { 'REQ-001': { path: newPath } });
		assert.deepStrictEqual(result.unresolved, ['NOPE-999']);
		assert.deepStrictEqual(result.corrected, []);
		assert.strictEqual(result.diagram, input);
	});

	test('an empty diagram yields empty results', () => {
		const result = DoorstopDiagramPanel.reconcilePaths({ nodes: [], edges: [] }, {});
		assert.deepStrictEqual(result.corrected, []);
		assert.deepStrictEqual(result.unresolved, []);
	});
});

suite('Diagram entry point (spec 025)', () => {
	interface MenuEntry { command: string; when?: string }
	let manifest: any;

	suiteSetup(async () => {
		manifest = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
	});

	test('"Open Traceability Graph" is gone from commands and every menu', () => {
		const commands: Array<{ command: string }> = manifest.contributes.commands;
		assert.ok(!commands.some(c => c.command === 'doorstop.showDiagram'));
		for (const [menu, entries] of Object.entries<MenuEntry[]>(manifest.contributes.menus)) {
			assert.ok(!entries.some(e => e.command === 'doorstop.showDiagram'), `still referenced in ${menu}`);
		}
	});

	test('the TreeView title bar has no diagram buttons', () => {
		const titleEntries: MenuEntry[] = manifest.contributes.menus['view/title'];
		const diagramButtons = titleEntries.filter(e => e.command.includes('Diagram') && e.when?.includes('doorstop.treeView'));
		assert.deepStrictEqual(diagramButtons, []);
	});

	test('New Diagram is still contributed, under the panel\'s name', () => {
		const newDiagram = manifest.contributes.commands.find((c: { command: string }) => c.command === 'doorstop.newDiagram');
		assert.ok(newDiagram, 'doorstop.newDiagram must stay contributed');
		assert.strictEqual(newDiagram.title, 'Doorstop: New Diagram');
	});

	test('Add to Diagram stays in the TreeView item context menu (FR-005)', () => {
		const itemMenu: MenuEntry[] = manifest.contributes.menus['view/item/context'];
		assert.ok(itemMenu.some(e => e.command === 'doorstop.addToDiagram' && e.when?.includes('view == doorstop.treeView')));
	});

	test('*.doorstop.json files open in the diagram editor by default (FR-004)', () => {
		const editor = manifest.contributes.customEditors.find((e: { viewType: string }) => e.viewType === 'doorstop.diagram');
		assert.ok(editor, 'doorstop.diagram custom editor must be contributed');
		assert.strictEqual(editor.priority, 'default');
		assert.ok(editor.selector.some((s: { filenamePattern: string }) => s.filenamePattern === '*.doorstop.json'));
	});

	test('the Commands panel lists New Diagram', () => {
		const items = new DoorstopCommandsProvider().getChildren();
		assert.ok(items.some(item => item.command?.command === 'doorstop.newDiagram'));
	});
});
