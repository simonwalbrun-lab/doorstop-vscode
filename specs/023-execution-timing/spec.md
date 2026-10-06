# Feature Specification: Execution Timing

**Feature Branch**: `023-execution-timing`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "For the development I want to have the possiblity to monitor the exectuion duration  of the different functions. Add the possiblity to measure and analyse the execution durations for the different parts."

## Clarifications

### Session 2026-10-06

- Q: When a command schedules extra work that only finishes after the command itself has finished, how should that extra work appear in the timing log? → A: Log it as its own top-level entry when it finishes, not nested under the already-finished command.
- Q: How should we check the speed and memory targets (under 2 % slowdown when off, under 1 ms overhead per measured operation, under 10 MB of memory)? → A: Mixed — the automated test suite checks memory (10,000 entries under 10 MB) and per-operation overhead with a generous bound (10,000 measured calls in under 10 s); the 2 % slowdown is checked by hand.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how long each operation took (Priority: P1)

As a developer of the extension, I want to switch on a timing mode and then see,
for every operation I trigger (loading the tree, opening the document view,
creating an item, running validation, a filter query, …), how long it took,
so that I can tell which parts are slow without adding ad-hoc log lines.

**Why this priority**: Without raw per-operation measurements there is nothing
to analyse. This story alone already replaces today's scattered one-off timing
log lines and answers "what was slow just now?".

**Independent Test**: Enable timing, refresh the requirement tree, open the
document view of one document, and run "Recheck Problems". Confirm a timing
log shows one entry per operation with its name and duration, that the
durations are plausible (non-zero, roughly matching the perceived wait), and
that the re-check entry has its server requests nested beneath it.

**Acceptance Scenarios**:

1. **Given** timing is enabled, **When** the user refreshes the requirement
   tree, **Then** the timing log shows an entry for the refresh command and a
   separate entry naming the tree load, each with its duration in
   milliseconds. (The refresh command only asks the tree to reload; the
   editor performs the actual load afterwards.)
2. **Given** timing is enabled, **When** an operation waits on a request to
   the server, **Then** the log shows the extension-side duration of the
   operation and, nested beneath it, the duration of the request. The split
   of that request into server-side stages is User Story 3.
3. **Given** timing is disabled (the default), **When** the user works with the
   extension, **Then** no timing entries are recorded or shown.
4. **Given** timing is enabled, **When** an operation fails, **Then** its
   entry is still recorded and marked as failed.

---

### User Story 2 - Analyse durations across many runs (Priority: P2)

As a developer, after a working session with timing enabled, I want a summary
per operation — how often it ran and its minimum, average, maximum, and
95th-percentile duration — sorted by total time spent, so that I can find
the parts worth optimising rather than reacting to a single slow run.

**Why this priority**: Single measurements are noisy; aggregated figures are
what drive optimisation decisions. Depends on Story 1's measurements.

**Independent Test**: Enable timing, refresh the tree five times, open a
document view twice, then open the timing summary. Confirm the tree load row
shows a count of 5, the document view row a count of 2, and that min ≤ avg ≤
max holds for every row.

**Acceptance Scenarios**:

1. **Given** measurements have been collected, **When** the user opens the
   timing summary, **Then** each distinct operation appears once with count,
   total, minimum, average, 95th percentile, and maximum duration.
2. **Given** the summary is shown, **Then** rows are ordered by total time
   spent, largest first.
3. **Given** measurements have been collected, **When** the user resets the
   timing data, **Then** the summary is empty and new measurements start from
   zero.

---

### User Story 3 - Break a slow operation into its parts (Priority: P3)

As a developer looking at one slow operation, I want to see how its duration
splits into its main stages — on the server: waiting for its turn behind
other requests, loading the Doorstop project, doing the actual work
(including building the response); in the extension: waiting for the server versus
rendering the result — so that I know which stage to optimise.

**Why this priority**: Turns "this is slow" into "this stage is slow". Most
valuable once Stories 1 and 2 have identified a slow operation.

**Independent Test**: Enable timing, trigger a server-backed operation, and
inspect its entry. Confirm the stages are listed with their own durations and
that the stage durations add up to no more than the operation's total.

**Acceptance Scenarios**:

1. **Given** timing is enabled, **When** two server requests are sent at the
   same time, **Then** the second request's entry shows a non-zero wait stage
   reflecting the time it queued behind the first.
2. **Given** an operation has stages, **When** the user views its entry,
   **Then** each stage shows its own duration and the remainder not covered
   by any stage is visible as unaccounted time.

---

### User Story 4 - Keep the measurements for later comparison (Priority: P3)

As a developer, I want to export the collected measurements to a file, so that
I can compare timings before and after an optimisation or attach them to an
issue.

**Why this priority**: Useful but not required to find a bottleneck in the
moment.

**Independent Test**: Collect some measurements, export them, and open the
file. Confirm it contains every recorded entry with operation name, start
time, duration, stages, and success/failure.

**Acceptance Scenarios**:

1. **Given** measurements exist, **When** the user exports them, **Then** a
   file is written containing every recorded entry in a structured,
   machine-readable format.
2. **Given** no measurements exist, **When** the user exports, **Then** the
   user is told there is nothing to export and no file is written.

---

### Edge Cases

- Timing is switched on or off while an operation is running: that operation
  is either recorded completely or not at all — never as a partial entry.
- The server is restarted: server-side measurements collected before the
  restart remain visible in the extension's record.
- The server is an older version without timing support: extension-side
  timings still work, and server-side detail is simply absent (no error).
- Very long sessions: memory used for measurements stays bounded; when the
  limit is reached the oldest individual entries are dropped, while the
  per-operation summary figures keep counting.
- Work started by an operation but finishing after that operation has
  finished (e.g. a delayed re-check scheduled by a refresh) is logged as its
  own top-level entry, so every recorded entry appears in the log and the
  log and summary always agree.
- Operations that are cancelled by the user are recorded and marked as
  cancelled rather than silently dropped.
- Operations shorter than the measurement resolution are recorded as
  sub-millisecond rather than as zero-length or omitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a setting to enable or disable timing,
  disabled by default.
- **FR-002**: While timing is enabled, the system MUST record, for every
  user-triggered extension operation (every contributed command except the
  timing feature's own commands, tree
  load/refresh, document view open/refresh, diagram load, validation run,
  filter execution, hover/CodeLens/completion lookups), its name, start time,
  duration, and outcome (success, failure, cancelled).
- **FR-003**: While timing is enabled, the system MUST record the duration of
  every server request handled, including its name (endpoint) and outcome.
- **FR-004**: Server request measurements MUST distinguish at least these
  stages: waiting for the request's turn, loading the Doorstop project, and
  the request's own work (which includes preparing the response).
- **FR-005**: Each server-side measurement MUST be linked to the extension
  operation that caused it, so they can be shown together.
- **FR-006**: The system MUST show recorded entries in a timing log as they
  happen, each line naming the operation, its duration, and its outcome.
- **FR-007**: Users MUST be able to open a timing summary that lists, per
  operation, the count, total, minimum, average, 95th-percentile, and maximum
  duration, ordered by total duration descending.
- **FR-008**: Users MUST be able to reset all collected measurements.
- **FR-009**: Users MUST be able to export all retained entries, with their
  stages, to a file in a structured, machine-readable format.
- **FR-010**: The system MUST retain at most a bounded number of individual
  entries (default: the most recent 10,000), dropping the oldest first; the
  summary figures MUST still include dropped entries.
- **FR-011**: When timing is disabled, the measurement code MUST NOT write
  log output and MUST NOT measurably slow down any operation.
- **FR-012**: A failure inside the timing mechanism itself MUST NOT cause the
  measured operation to fail or change its result.
- **FR-013**: The existing ad-hoc timing log lines MUST be replaced by the new
  mechanism, so there is one place to read timings from.

### Key Entities

- **Timing Entry**: one measured execution — operation name, source
  (extension or server), start time, duration, outcome, optional parent entry
  (the extension operation that triggered a server request), and an ordered
  list of stages.
- **Stage**: a named part of a Timing Entry with its own duration (e.g.
  "wait for turn", "load project", "work").
- **Operation Summary**: aggregate figures for all entries sharing one
  operation name — count, total, min, average, 95th percentile, max.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With timing enabled, a developer can name the slowest operation
  of a working session within 1 minute of opening the summary, without
  editing any code.
- **SC-002**: 100% of contributed commands and 100% of server endpoints
  produce a timing entry when exercised with timing enabled.
- **SC-003**: With timing disabled, the duration of tree load, document view
  open, and validation differs by less than 2% from a build without the
  feature. Verified by hand during the final walkthrough.
- **SC-004**: With timing enabled, recording adds less than 1 millisecond per
  measured operation. The automated test suite guards against regressions
  with a generous bound: 10,000 measured no-op operations finish in under
  10 seconds.
- **SC-005**: For any server-backed operation, the stage durations shown
  account for at least 90% of the server-side total, leaving at most 10%
  unaccounted.
- **SC-006**: Memory used by retained measurements stays below 10 MB in a
  session of 8 hours with timing enabled. The automated test suite checks
  that a full buffer of 10,000 retained entries stays under 10 MB.

## Assumptions

- The audience is developers of this extension; end users never need to see
  timing output, hence off by default and no user-facing UI beyond the
  setting, the log, and the summary/reset/export commands.
- Measurements are kept in memory for the current editor session only; the
  export covers anything that should outlive the session.
- "Different functions" is interpreted as user-visible operations, server
  requests, and the named stages within them — not every internal function
  call. Finer-grained stages can be added later where a bottleneck is found.
- The summary is presented as plain text/table inside the editor; charts are
  out of scope for this feature.
- The 95th percentile is computed from retained entries; once old entries are
  dropped (FR-010), it reflects the most recent entries while count, total,
  min, and max stay exact.
- The server already processes requests one at a time (Constitution
  Principle I), so the "waiting for turn" stage is meaningful and is the
  expected main cause of queueing delay.
- Per Constitution Principle IV, the feature is expected to work without new
  third-party dependencies.
