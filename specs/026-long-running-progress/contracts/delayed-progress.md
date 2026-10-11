# Contract: `src/progress.ts`

Internal TypeScript module; the only contract other code depends on.

```ts
/**
 * Runs `work` now. If it is still running after 1 s, shows a notification
 * "<title>" until it settles. Resolves/rejects exactly like `work`.
 */
export function withDelayedProgress<T>(title: string, work: () => Promise<T>): Promise<T>;

/** Test-only: replace the toast function; pass undefined to restore. */
export function setProgressForTest(fn: typeof vscode.window.withProgress | undefined): void;
```

## Guarantees

| # | Guarantee | Spec |
| - | --------- | ---- |
| G1 | `work` is invoked synchronously, exactly once | FR-001 |
| G2 | No toast if `work` settles within 1000 ms | FR-002, SC-002 |
| G3 | If still running at 1000 ms, exactly one toast with `location: Notification` and the given `title` | FR-001, SC-001, FR-008 |
| G4 | The toast's task promise settles when `work` settles | SC-003 |
| G5 | The returned promise has `work`'s value or `work`'s original error; the helper never adds its own error message and never produces an unhandled rejection | FR-004 |
| G6 | `title` is passed verbatim; callers supply user-facing text such as `Doorstop: Refresh…` | FR-003 |

## Caller rules

- Call it **after** all prompts/pickers/confirmations; never wrap code that
  awaits user input (FR-005). A command with input between work steps wraps
  each step separately.
- Do not use it for background work the user did not trigger (FR-006).
- Error reporting stays with the caller (existing messages unchanged).
