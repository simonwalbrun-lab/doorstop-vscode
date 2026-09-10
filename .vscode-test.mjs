import { defineConfig } from '@vscode/test-cli';

// Two labeled configs so the regression-fixture suite gets its own workspace
// (testdata/regression) without the existing, workspace-less suite picking it
// up too — each config's `files` glob must stay non-overlapping since
// @vscode/test-cli runs both by default. `npm test` runs both sequentially.
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
		// Needs the fixture workspace (so the extension activates and its CodeLens
		// providers register) but deliberately starts no Doorstop server — lens
		// provision must be a pure text scan.
		label: 'reviewLensScan',
		files: 'out/test/reviewLensScan.test.js',
		workspaceFolder: 'testdata/regression',
	},
]);
