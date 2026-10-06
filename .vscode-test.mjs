import { defineConfig } from '@vscode/test-cli';

// Labeled configs so each suite gets the workspace it needs (or none) without the
// others picking its files up too — each config's `files` glob must stay
// non-overlapping since @vscode/test-cli runs them all by default.
// `npm test` runs them sequentially.
export default defineConfig([
	{
		label: 'unit',
		files: 'out/test/extension.test.js',
	},
	{
		label: 'regressionFixture',
		files: 'out/test/regressionFixture.test.js',
		workspaceFolder: 'testdata/regression',
	},
	{
		// Pure geometry + diagram-document persistence. No fixture workspace and no
		// Doorstop server: src/webview/diagram/layout.js is written dual-mode so it
		// loads under plain Node, which is what makes this suite CI-runnable
		// (constitution principle VI).
		label: 'diagramLayout',
		files: 'out/test/diagramLayout.test.js',
	},
	{
		// The Document View's pure text model (spec 019): render / parse / save
		// plan over in-memory snapshots. No fixture workspace, no server.
		label: 'documentViewModel',
		files: 'out/test/documentViewModel.test.js',
	},
	{
		// The status report's pure Markdown/chart builder (spec 021). No fixture
		// workspace, no server, no git.
		label: 'statusReport',
		files: 'out/test/statusReport.test.js',
	},
	{
		// Filter notebooks' pure serializer / result rendering (spec 022). No
		// fixture workspace, no server.
		label: 'filterNotebook',
		files: 'out/test/filterNotebook.test.js',
	},
	{
		// Execution timing's in-memory bookkeeping (spec 023). No fixture
		// workspace, no server.
		label: 'timing',
		files: 'out/test/timing.test.js',
	},
	{
		// Needs the fixture workspace (so the extension activates and its CodeLens
		// providers register) but deliberately starts no Doorstop server — lens
		// provision must be a pure text scan.
		label: 'reviewLensScan',
		files: 'out/test/reviewLensScan.test.js',
		workspaceFolder: 'testdata/regression',
	},
]);
