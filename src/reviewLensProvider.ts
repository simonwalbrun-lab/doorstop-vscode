import * as path from 'node:path';
import * as vscode from 'vscode';

import { DoorstopServer } from './doorstopServer';

/**
 * The commands and document scan behind Doorstop's review / suspect-link
 * workflow.
 *
 * Every state change here goes through the server (POST /review, POST /clear) -
 * nothing in this file ever writes requirement files itself. What it computes
 * locally is only *editor geometry*: which line a given metadata field is on. A
 * parent UID lifted off a link line is treated as untrusted input and validated
 * by the server, exactly like a UID typed into the `doorstop.link` input box.
 *
 * These three commands used to be offered as CodeLenses above their own fields.
 * They are now offered as Quick Fixes on the problems Doorstop's validation
 * already reports for them - see reviewCodeActionProvider.ts, which consumes the
 * scan below. The scan itself is unchanged.
 *
 * See specs/013-review-suspect-codelenses/research.md sections 2 and 6, and
 * specs/017-gutter-icon-actions/research.md section 1.
 */

export interface LinkEntryAnchor {
  /** Line of this link entry, where its lens is anchored. */
  line: number;
  /** Parent UID token read off the line. Untrusted - validated server-side. */
  parentUid: string;
}

export interface RequirementLensScan {
  /** UID of the item this document represents (filename basename). */
  uid: string;
  /** Line of the `reviewed:` metadata field, if present. */
  reviewedLine?: number;
  /** Line of the `links:` metadata field, if present. */
  linksLine?: number;
  /** One per `- UID[: stamp]` entry beneath `links:`. Empty for `links: []`. */
  linkEntries: LinkEntryAnchor[];
}

export interface ReviewLensContext {
  uid: string;
  documentUri: string;
}

export interface ClearAllLensContext {
  uid: string;
  documentUri: string;
}

export interface ClearOneLensContext {
  uid: string;
  parentUid: string;
  documentUri: string;
}

export interface ReviewCommandOptions {
  server: DoorstopServer;
  onChanged?: () => void;
}

// Anchored at column 0 on purpose: these must match the item's own top-level
// metadata keys, not a same-named line indented inside the `text: |` block.
const REVIEWED_FIELD_REGEX = /^reviewed\s*:/i;
const LINKS_FIELD_REGEX = /^links\s*:/i;
/** A YAML sequence entry, capturing the UID token before an optional `: stamp`. */
const LINK_ENTRY_REGEX = /^\s*-\s+([^\s:]+)\s*(?::|$)/;
const FRONTMATTER_FENCE_REGEX = /^---\s*$/;

function getRequirementUid(document: vscode.TextDocument): string | undefined {
  const extension = path.extname(document.fileName).toLowerCase();
  if (extension !== '.yml' && extension !== '.md') {
    return undefined;
  }
  return path.basename(document.fileName, extension);
}

/**
 * The lines that hold the item's metadata. For a YAML item that is the whole
 * file; for a Markdown item it is only the `---` frontmatter block, so a
 * `links:` line written in the prose body cannot sprout lenses.
 * Returns undefined when a `.md` file has no frontmatter at all.
 */
function getMetadataLineRange(
  document: vscode.TextDocument,
  lines: string[]
): { start: number; end: number } | undefined {
  if (path.extname(document.fileName).toLowerCase() !== '.md') {
    return { start: 0, end: lines.length };
  }
  if (lines.length === 0 || !FRONTMATTER_FENCE_REGEX.test(lines[0])) {
    return undefined;
  }
  for (let line = 1; line < lines.length; line++) {
    if (FRONTMATTER_FENCE_REGEX.test(lines[line])) {
      return { start: 1, end: line };
    }
  }
  return undefined;
}

/**
 * Pure, synchronous text scan - no network call, so lenses keep rendering while
 * the server is down or still booting (spec SC-005).
 */
export function scanRequirementDocument(document: vscode.TextDocument): RequirementLensScan | undefined {
  const uid = getRequirementUid(document);
  if (!uid) {
    return undefined;
  }

  const lines = document.getText().split(/\r?\n/);
  const range = getMetadataLineRange(document, lines);
  if (!range) {
    return undefined;
  }

  const scan: RequirementLensScan = { uid, linkEntries: [] };
  for (let line = range.start; line < range.end; line++) {
    const text = lines[line];
    if (scan.reviewedLine === undefined && REVIEWED_FIELD_REGEX.test(text)) {
      scan.reviewedLine = line;
      continue;
    }
    if (scan.linksLine === undefined && LINKS_FIELD_REGEX.test(text)) {
      scan.linksLine = line;
      // Consecutive sequence entries only: the first line that is not one ends
      // the block (it is the next metadata key). `links: []` yields none.
      for (let entry = line + 1; entry < range.end; entry++) {
        const match = LINK_ENTRY_REGEX.exec(lines[entry]);
        if (!match) {
          break;
        }
        scan.linkEntries.push({ line: entry, parentUid: match[1] });
      }
    }
  }

  if (scan.reviewedLine === undefined && scan.linksLine === undefined) {
    return undefined;
  }
  return scan;
}

/**
 * The server rewrites the requirement file from its own in-memory tree, so an
 * unsaved buffer would either be clobbered or would later revert the server's
 * stamp. Never save silently: a lens click is not consent to persist an
 * unrelated half-finished edit (spec FR-010).
 *
 * Returns false when the action must not proceed.
 */
async function ensureSavedOrConfirm(documentUri: string, actionLabel: string): Promise<boolean> {
  const document = vscode.workspace.textDocuments.find(
    candidate => candidate.uri.toString() === documentUri
  );
  if (!document?.isDirty) {
    return true;
  }

  const saveAndContinue = 'Save and Continue';
  const choice = await vscode.window.showWarningMessage(
    `This requirement has unsaved changes. They must be saved before ${actionLabel}, ` +
    'because the Doorstop server rewrites the file.',
    { modal: true },
    saveAndContinue
  );
  if (choice !== saveAndContinue) {
    return false;
  }

  try {
    if (!(await document.save())) {
      void vscode.window.showErrorMessage(`Could not save ${path.basename(document.fileName)}; nothing was changed.`);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Could not save the requirement: ${message}`);
    return false;
  }
  return true;
}

/** The single request path shared by all three commands. */
async function runLensAction(
  options: ReviewCommandOptions,
  successMessage: string,
  send: () => Promise<unknown>
): Promise<void> {
  try {
    await send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Doorstop command failed: ${message}`);
    return;
  }
  options.onChanged?.();
  void vscode.window.showInformationMessage(successMessage);
}

export function registerReviewCommands(
  context: vscode.ExtensionContext,
  options: ReviewCommandOptions
): void {
  const doReview = vscode.commands.registerCommand(
    'doorstop.doReview',
    async (arg?: ReviewLensContext) => {
      // Also the Command Palette path, where the command is invoked with no argument.
      if (!arg?.uid) {
        void vscode.window.showErrorMessage('The requirement UID could not be determined.');
        return;
      }
      if (!(await ensureSavedOrConfirm(arg.documentUri, 'reviewing this requirement'))) {
        return;
      }
      await runLensAction(options, `${arg.uid} was marked as reviewed.`, () =>
        options.server.request('POST', '/review', { scope: 'item', target: arg.uid })
      );
    }
  );

  const clearAllSuspicions = vscode.commands.registerCommand(
    'doorstop.clearAllSuspicions',
    async (arg?: ClearAllLensContext) => {
      if (!arg?.uid) {
        void vscode.window.showErrorMessage('The requirement UID could not be determined.');
        return;
      }
      if (!(await ensureSavedOrConfirm(arg.documentUri, 'clearing its suspect links'))) {
        return;
      }
      // No `parents` field: omitting it is what makes Doorstop clear every link.
      await runLensAction(options, `All suspect links of ${arg.uid} were cleared.`, () =>
        options.server.request('POST', '/clear', { scope: 'item', target: arg.uid })
      );
    }
  );

  const clearSuspicion = vscode.commands.registerCommand(
    'doorstop.clearSuspicion',
    async (arg?: ClearOneLensContext) => {
      if (!arg?.uid || !arg.parentUid) {
        void vscode.window.showErrorMessage('The requirement UID could not be determined.');
        return;
      }
      if (!(await ensureSavedOrConfirm(arg.documentUri, 'clearing this suspect link'))) {
        return;
      }
      // arg.parentUid comes from document text and is deliberately not validated
      // here - the server resolves it and rejects an unknown UID with a 400.
      await runLensAction(options, `The link from ${arg.uid} to ${arg.parentUid} was cleared.`, () =>
        options.server.request('POST', '/clear', {
          scope: 'item',
          target: arg.uid,
          parents: [arg.parentUid]
        })
      );
    }
  );

  context.subscriptions.push(doReview, clearAllSuspicions, clearSuspicion);
}
