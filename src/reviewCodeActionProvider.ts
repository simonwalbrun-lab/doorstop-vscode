import * as vscode from 'vscode';

import {
  ClearAllLensContext,
  ClearOneLensContext,
  ReviewLensContext,
  scanRequirementDocument
} from './reviewLensProvider';

/**
 * Quick Fixes for Doorstop's review / suspect-link workflow.
 *
 * These actions attach to the problems Doorstop's own validation already
 * reports (rendered by problemsProvider.ts), rather than being offered
 * unconditionally: an item is only "fixable" here when Doorstop itself says
 * there is something to fix. That is what keeps this provider from becoming a
 * second, client-side opinion about review and suspect state - it never decides
 * *whether* there is a problem, only *how* to resolve one that is already
 * reported. See specs/017-gutter-icon-actions/research.md sections 2 and 4.
 *
 * The commands themselves live in reviewLensProvider.ts and are unchanged; this
 * file only replaces how they are offered (was: CodeLens above the line).
 */

/** Doorstop checks that mean "this item needs reviewing". */
const REVIEW_CHECKS = new Set(['needs_initial_review', 'unreviewed_changes']);
/** Doorstop's check id for a link whose parent changed since it was stamped. */
const SUSPECT_LINK_CHECK = 'suspect_link';

/** `Diagnostic.code` is a union; only our own string codes are of interest. */
function codeOf(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (typeof code === 'string') {
    return code;
  }
  if (code && typeof code === 'object' && typeof code.value === 'string') {
    return code.value;
  }
  return undefined;
}

function isDoorstopDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.source === 'doorstop';
}

/**
 * The doorstop diagnostic anchored to `line` whose check is in `checks`.
 * Anchors are always whole-line ranges (problemsProvider.ts), so comparing the
 * start line is exact - no intersection arithmetic needed.
 */
function diagnosticOn(
  diagnostics: readonly vscode.Diagnostic[],
  line: number,
  checks: ReadonlySet<string> | string
): vscode.Diagnostic | undefined {
  const matches = (code: string | undefined): boolean =>
    code !== undefined && (typeof checks === 'string' ? code === checks : checks.has(code));
  return diagnostics.find(
    diagnostic => diagnostic.range.start.line === line && matches(codeOf(diagnostic))
  );
}

function covers(range: vscode.Range, line: number): boolean {
  return range.start.line <= line && line <= range.end.line;
}

function quickFix(
  title: string,
  command: string,
  argument: ReviewLensContext | ClearAllLensContext | ClearOneLensContext,
  diagnostic: vscode.Diagnostic,
  preferred: boolean
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.command = { command, title, arguments: [argument] };
  // Ties the fix to that specific problem, so it also appears from the Problems
  // panel's own quick-fix affordance, not just the editor lightbulb.
  action.diagnostics = [diagnostic];
  action.isPreferred = preferred;
  return action;
}

export function registerReviewCodeActionProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range): vscode.CodeAction[] {
      const scan = scanRequirementDocument(document);
      if (!scan) {
        return [];
      }

      // Read from what is already published rather than calling /validate here:
      // provideCodeActions must stay synchronous and network-free, exactly as
      // lens provision was (data-model.md invariant 2).
      const diagnostics = vscode.languages.getDiagnostics(document.uri).filter(isDoorstopDiagnostic);
      const documentUri = document.uri.toString();
      const actions: vscode.CodeAction[] = [];

      if (scan.reviewedLine !== undefined && covers(range, scan.reviewedLine)) {
        const needsReview = diagnosticOn(diagnostics, scan.reviewedLine, REVIEW_CHECKS);
        if (needsReview) {
          actions.push(quickFix(
            'Do Review',
            'doorstop.doReview',
            { uid: scan.uid, documentUri } satisfies ReviewLensContext,
            needsReview,
            true
          ));
        }
      }

      const suspectEntry = scan.linkEntries.find(entry => covers(range, entry.line));
      const suspectDiagnostic = suspectEntry
        ? diagnosticOn(diagnostics, suspectEntry.line, SUSPECT_LINK_CHECK)
        : undefined;
      if (suspectEntry && suspectDiagnostic) {
        actions.push(quickFix(
          'Clear Suspect Link',
          'doorstop.clearSuspicion',
          {
            uid: scan.uid,
            parentUid: suspectEntry.parentUid,
            documentUri
          } satisfies ClearOneLensContext,
          suspectDiagnostic,
          true
        ));

        // Offered from any one of them, because the bulk action has no anchor of
        // its own: Doorstop reports suspect links per entry and never emits a
        // summary problem on `links:` (research.md section 4).
        const suspectCount = diagnostics.filter(
          diagnostic => codeOf(diagnostic) === SUSPECT_LINK_CHECK
        ).length;
        if (suspectCount >= 2) {
          actions.push(quickFix(
            'Clear All Suspect Links',
            'doorstop.clearAllSuspicions',
            { uid: scan.uid, documentUri } satisfies ClearAllLensContext,
            suspectDiagnostic,
            false
          ));
        }
      }

      return actions;
    }
  };

  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(
    [{ language: 'yaml' }, { language: 'markdown' }],
    provider,
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  ));
}
