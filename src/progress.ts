import * as vscode from 'vscode';

// Progress notifications by actual run time (spec 026, constitution principle VII):
// work that is still running after one second shows a notification until it
// settles; faster work shows none. Callers wrap only the work, never prompts.

const DELAY_MS = 1000;

const native: typeof vscode.window.withProgress = (options, task) => vscode.window.withProgress(options, task);
let progress = native;
/** Titles with a notification on screen: a repeat run never stacks a second one (FR-008). */
const showing = new Set<string>();

export function setProgressForTest(fn: typeof vscode.window.withProgress | undefined): void {
  progress = fn ?? native;
}

/** Updates the notification's message, e.g. the document currently being worked on. */
export type ProgressReport = (message: string) => void;

export interface DelayedProgressOptions {
  /** Offers Cancel on the notification; `work`'s token fires when it is clicked. */
  cancellable?: boolean;
  /** Defaults to a notification; `Window` is the status-bar spinner for background work (spec 032). */
  location?: vscode.ProgressLocation;
}

/**
 * Runs `work` now; resolves or rejects exactly like it. Messages `work` reports
 * before the notification appears are kept, so it opens with the latest one.
 */
export function withDelayedProgress<T>(
  title: string,
  work: (report: ProgressReport, token: vscode.CancellationToken) => Promise<T>,
  options: DelayedProgressOptions = {}
): Promise<T> {
  let latest: string | undefined;
  let forward: ProgressReport | undefined;
  // Handed to `work` up front; Cancel can only be clicked once the notification shows.
  const cancellation = new vscode.CancellationTokenSource();
  const running = work(message => {
    latest = message;
    forward?.(message);
  }, cancellation.token);
  const timer = setTimeout(() => {
    if (showing.has(title)) {
      return;
    }
    showing.add(title);
    const location = options.location ?? vscode.ProgressLocation.Notification;
    // The notification closes when the work settles; its copy of a failure is
    // dropped here because the caller already receives the original one.
    void Promise.resolve(progress({ location, title, cancellable: options.cancellable }, (notification, token) => {
      token.onCancellationRequested(() => cancellation.cancel());
      forward = message => notification.report({ message });
      if (latest !== undefined) {
        forward(latest);
      }
      return running;
    }))
      .catch(() => undefined)
      .then(() => showing.delete(title));
  }, DELAY_MS);
  const clear = (): void => {
    clearTimeout(timer);
    cancellation.dispose();
  };
  running.then(clear, clear);
  return running;
}
