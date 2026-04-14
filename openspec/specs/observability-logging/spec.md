# observability-logging Specification

## Purpose
TBD - created by archiving change remediate-dev-server-findings. Update Purpose after archive.
## Requirements
### Requirement: Concurrent-safe raw-logger initialization

The `logRawClaudeMessage` function in `src/main/lib/claude/raw-logger.ts` SHALL be safe to call concurrently from multiple async contexts. Parallel calls made before the logs directory exists MUST serialize correctly so that every `appendFile` runs against a directory that has already been `mkdir`-created.

The implementation SHALL use a singleton-promise pattern: a module-scoped `Promise<string> | null` that is awaited by every caller. The first call initiates the underlying `mkdir`; concurrent callers share the pending promise. On rejection, the promise MUST be reset to `null` so a subsequent call can retry.

Because `fs/promises.mkdir({recursive: true})` is itself idempotent, incidental concurrent retries after rejection are safe but SHOULD be avoided — the reset-on-rejection MUST occur exactly once per original rejection.

The public API of `logRawClaudeMessage` SHALL be unchanged from its pre-fix signature — callers do not need to be modified.

#### Scenario: Concurrent first-burst writes all succeed

- **WHEN** 20 calls to `logRawClaudeMessage` fire in parallel before the logs directory has been created
- **THEN** the logs directory is created exactly once
- **AND** all 20 entries appear in the output JSONL file
- **AND** no `ENOENT` errors are logged by the logger's catch block

#### Scenario: Failure recovery resets the cache

- **WHEN** `ensureLogsDir()` rejects (e.g., permission error)
- **AND** `logRawClaudeMessage` is called again later
- **THEN** the singleton promise is retried from scratch (the rejected promise is not cached)

#### Scenario: Incidental concurrent retries after rejection do not corrupt state

- **WHEN** two callers both observe a rejected `ensureLogsDir()` promise within the same tick
- **AND** both trigger a retry before the `.catch` handler has reset the promise to null
- **THEN** the resulting `mkdir({recursive: true})` calls succeed idempotently
- **AND** no double-create errors are thrown

