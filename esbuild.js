const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyWebviewAssets() {
	const src = path.join(__dirname, 'src', 'webview');
	const dest = path.join(__dirname, 'dist', 'webview');
	fs.rmSync(dest, { recursive: true, force: true });
	fs.cpSync(src, dest, { recursive: true });
	// The canvas library ships inside the extension: no CDN, works offline.
	const vis = path.join(__dirname, 'node_modules', 'vis-network');
	const vendor = path.join(dest, 'diagram', 'vendor');
	fs.mkdirSync(vendor, { recursive: true });
	fs.copyFileSync(path.join(vis, 'standalone', 'umd', 'vis-network.min.js'), path.join(vendor, 'vis-network.min.js'));
	fs.copyFileSync(path.join(vis, 'styles', 'vis-network.min.css'), path.join(vendor, 'vis-network.min.css'));
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			copyWebviewAssets();
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
