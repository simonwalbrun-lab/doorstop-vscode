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

/** Runs `work` now; resolves or rejects exactly like it. */
export function withDelayedProgress<T>(title: string, work: () => Promise<T>): Promise<T> {
  const running = work();
  const timer = setTimeout(() => {
    if (showing.has(title)) {
      return;
    }
    showing.add(title);
    // The notification closes when the work settles; its copy of a failure is
    // dropped here because the caller already receives the original one.
    void Promise.resolve(progress({ location: vscode.ProgressLocation.Notification, title }, () => running))
      .catch(() => undefined)
      .then(() => showing.delete(title));
  }, DELAY_MS);
  const clear = (): void => clearTimeout(timer);
  running.then(clear, clear);
  return running;
}
