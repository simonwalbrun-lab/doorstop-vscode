import { exec, spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import * as vscode from 'vscode';

// PDF export (spec 027): the headless-browser script lives in the user's
// repository so VS Code and CI run the very same copy. The extension only copies
// it there once, installs its dependencies, and runs it on published HTML.

export const PDF_TOOLING_DIR = 'doorstop-pdf';
const NODE_MISSING = 'PDF export needs Node.js and npm on PATH.';

/**
 * Copies the tooling files the target does not have yet and returns their names.
 * Existing files are never overwritten (FR-009b): the user may have edited the
 * script or replaced the logo. `gitignore` ships without its dot so the extension
 * package keeps it.
 */
export async function copyTooling(sourceDir: string, targetDir: string): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const copied: string[] = [];
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {continue;}
    const name = entry.name === 'gitignore' ? '.gitignore' : entry.name;
    try {
      await fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, name), fsConstants.COPYFILE_EXCL);
      copied.push(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {throw error;}
    }
  }
  return copied;
}

export async function isToolingInstalled(toolingDir: string): Promise<boolean> {
  return fs.access(path.join(toolingDir, 'node_modules', 'playwright')).then(() => true, () => false);
}

/** npm/npx are `.cmd` shims on Windows, so they go through a shell; the commands are fixed strings. */
function shell(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
      } else if (error.code === 127 || error.code === 9009) {
        // "command not found" from sh / cmd.exe.
        reject(new Error(NODE_MISSING));
      } else {
        reject(new Error(String(stderr).trim() || error.message));
      }
    });
  });
}

export async function installTooling(toolingDir: string): Promise<void> {
  await shell('npm ci', toolingDir);
  await shell('npx playwright install chromium', toolingDir);
}

/**
 * Runs the in-repo export script. `onExporting` sees each PDF's name as the script
 * starts on it, so the progress toast can name the current document.
 */
export function runExportScript(
  toolingDir: string,
  input: string,
  output: string,
  cwd: string,
  onExporting?: (name: string) => void
): Promise<{ written: string[]; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(toolingDir, 'export-pdf.mjs'), input, output], { cwd });
    const written: string[] = [];
    let stderr = '';
    readline.createInterface({ input: child.stdout }).on('line', line => {
      const exporting = /^Exporting (.+)$/.exec(line);
      const done = /^PDF written to (.+)$/.exec(line);
      if (exporting) {
        onExporting?.(exporting[1]);
      } else if (done) {
        written.push(done[1]);
      }
    });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
      reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(NODE_MISSING) : error);
    });
    child.on('close', code => {
      if (code === 0) {
        resolve({ written, warnings: stderr.split(/\r?\n/).filter(line => line.startsWith('Warning:')) });
      } else {
        reject(new Error(`PDF export failed: ${stderr.trim()}`));
      }
    });
  });
}

async function showFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (message === NODE_MISSING) {
    const getNode = 'Get Node.js';
    if (await vscode.window.showErrorMessage(message, getNode) === getNode) {
      await vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org'));
    }
  } else {
    void vscode.window.showErrorMessage(`Doorstop: PDF tooling setup failed: ${message}`);
  }
}

/**
 * After an export failed because the packages are installed but the browser is
 * not (FR-011), offers to download it. Any other failure is left alone.
 */
export async function offerBrowserInstall(toolingDir: string, error: unknown): Promise<void> {
  if (!/Executable doesn't exist/.test(error instanceof Error ? error.message : String(error))) {return;}
  const install = 'Install';
  if (await vscode.window.showWarningMessage('The headless browser for PDF export is not installed.', install) !== install) {
    return;
  }
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Doorstop: Installing PDF tooling…' },
      () => shell('npx playwright install chromium', toolingDir)
    );
    void vscode.window.showInformationMessage('PDF tooling installed. Publish again to create the PDF.');
  } catch (installError) {
    await showFailure(installError);
  }
}

/**
 * Makes sure `<workspace>/doorstop-pdf` holds the script and its installed
 * dependencies, asking before each step. Returns the folder, or `undefined` when
 * the user declined or setup failed.
 */
export async function ensurePdfTooling(extensionPath: string, workspaceFolder: string): Promise<string | undefined> {
  const toolingDir = path.join(workspaceFolder, PDF_TOOLING_DIR);
  try {
    const hasScript = await fs.access(path.join(toolingDir, 'export-pdf.mjs')).then(() => true, () => false);
    if (!hasScript) {
      const setUp = 'Set up';
      const choice = await vscode.window.showInformationMessage(
        `Set up PDF export in this workspace? This adds the folder ${PDF_TOOLING_DIR}/ with the export script.`,
        { modal: true },
        setUp
      );
      if (choice !== setUp) {return undefined;}
      await copyTooling(path.join(extensionPath, 'media', 'pdf-export'), toolingDir);
    }
    if (!await isToolingInstalled(toolingDir)) {
      const install = 'Install';
      if (await vscode.window.showInformationMessage('PDF tooling is not installed.', install) !== install) {
        return undefined;
      }
      // Always takes longer than a second (downloads a browser), so the toast shows at once.
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Doorstop: Installing PDF tooling…' },
        () => installTooling(toolingDir)
      );
    }
    return toolingDir;
  } catch (error) {
    await showFailure(error);
    return undefined;
  }
}
