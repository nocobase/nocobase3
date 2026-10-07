# Design

How the runtime keeps one copy of the state, makes every change atomic, and runs effects without losing or duplicating them — and what it deliberately leaves out. Read [concepts.md](concepts.md) first.

## Six invariants

| Invariant                                            | What guarantees it                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The state is stored once                             | The state is a field of the record; there is no process instance table                                                                                                                                                                                                                                                   |
| A change is written completely or not at all         | The record, the log entry and the effect runs are written in one transaction                                                                                                                                                                                                                                             |
| Of two concurrent changes to one record, one commits | A conditional update: the write applies only while the state and the version are unchanged, otherwise `CONFLICT`. The log holds `(lifecycle, recordId, version)` under a unique index                                                                                                                                    |
| What a button shows is what a click does             | `available()`, `can()` and `fire()` ask the same guards and return the same blockers; `can()` with the click's input also validates it first, as `fire()` does, while `available()`, `view()` and `can()` without input ask the guards with `{}`                                                                         |
| A committed transition never loses its effects       | Effect runs are written in the transition's transaction (a transactional outbox); `reclaim()` on every sweep hands over again a queued run whose dispatch was lost and an attempt whose process stopped, each once it has waited a lease                                                                                 |
| One request takes effect once                        | `requestId` is kept on the log entry, and `requestKey` — the `requestId`, or `$v:<version>` without one — under a unique index on `(lifecycle, recordId, requestKey)`; a repeat of the same transition returns the first result, marked `replayed`; the key sent for another transition is refused with `REQUEST_REUSED` |

## Inside the transaction

`runtime.fire(name, id, transition, options)` runs the first five steps in one transaction; any error rolls all of them back.

```mermaid
sequenceDiagram
  participant P as Page / caller
  participant R as Runtime
  participant DB as Store (one transaction)
  participant D as Dispatcher
  P->>R: fire(transition, input, requestId, expect.version)
  R->>DB: look the requestId up in the log
  alt already fired
    DB-->>R: the first log entry
    R-->>P: replayed: true, nothing written
  else new request
    R->>DB: read the record, check expect.version / changedBefore
    R->>R: state check, validate, guards and addGuard, route, accept, set
    R->>DB: conditional update (state and version unchanged)
    R->>DB: log entry (version + 1, requestId)
    R->>R: onTransition hook (same transaction)
    R->>DB: effect runs (queued)
    DB-->>R: commit
    R->>R: notify listeners: completed / entered / announce
    R->>D: dispatch(runId, runAfter)
    R-->>P: record, entry, effectRuns
  end
```

### Joining the caller's transaction

With `transaction`, `fire()` and `create()` do not open a transaction of their own: the store nests the work in the caller's, as a savepoint on `@nocobase/db` and as a nested undo log in the memory store. What follows a commit — the listeners and the dispatch — is registered with the store's `afterCommit` before the transition is decided, so it runs once the outermost transaction commits, a transition before what its `onTransition` started, and never after a rollback. A refusal rolls back only the savepoint, which is what lets a parent's refusal undo a child's transition without the child's caller losing its own writes, and lets a caller that catches the refusal commit the rest. A call without `transaction` goes through the same path in a transaction of its own, so `fire()` still returns after its in-process effects have run.

An effect's continuation is decided the same way, nested in the transaction that records the effect's outcome, with its listeners and effects registered before it is decided. A refusal — the continuation's own, or one a lifecycle call in its `onTransition` raised, such as a parent refusing the child's last step — rolls back only the continuation: the record, its log entry, what its `onTransition` wrote and the runs it owed are all undone together, and the outcome stays recorded.

### Why the condition compares the version as well as the state

Comparing the state alone breaks on self-transitions. The expense report's `escalate` goes from `awaitingManager` to `awaitingManager`; two concurrent escalations would both see the state unchanged and both commit. Every transition increments `lifecycleVersion`, the condition includes it, and the second one fails.

### Why the page sends the version back

A manager opens a report at version 3. Meanwhile the applicant withdraws it and resubmits; the record is at version 5 and back in `awaitingManager`. Judged by state alone, the manager's "approve" would be taken as approval of the new content. With `expect: { version: 3 }` the click is refused, and the page reloads before the manager decides again.

### Creation is a transition too

`runtime.create()` writes a log entry with `from: null`, `transition: '$create'` and `version: 1`, and runs the initial state's `onEnter` effects. History starts at creation, and "send a welcome mail on entering draft" needs no special case. `initial` may list several states; the first is the default and the others are asked for by name. Setting the state field in `values` is refused with `INVALID_SET`. The definition's `create` holds a `validate` over the values and a `guard` over the values, the state and the actor, run in that order inside the creation's transaction, so who may create what is one rule for every caller rather than a check in each route.

## Effect execution

```mermaid
stateDiagram-v2
  [*] --> queued: transition commits
  queued --> running: an attempt is claimed
  running --> succeeded: run returns
  running --> queued: failed, attempts left (after backoff)
  running --> queued: outcome could not be recorded (after backoff)
  running --> queued: lease expired, reclaim() takes it back
  queued --> queued: due for a lease and not claimed, reclaim() hands it over again
  running --> failed: last attempt failed, or shouldRetry says no
  queued --> dead: attempts used up without an outcome
  queued --> cancelled: cancelRun
  running --> cancelled: cancelRun (aborts the attempt here)
  failed --> queued: retryRun
  dead --> queued: retryRun
  cancelled --> queued: retryRun
```

| Mechanism                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotency key                          | `idempotencyKey` is the same on every attempt of a run. Pass it to the external system so a retry does not pay twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Retry                                    | After failure n the next attempt waits `backoffMs × factor^(n-1)`, capped at `maxMs`; `shouldRetry(error)` returning false fails at once, as for a declined payment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Timeout                                  | `timeoutMs` aborts the attempt's `signal` and counts the attempt as failed, whether or not `run` noticed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Fencing                                  | Every write names its attempt (`attempts`) in its condition. An attempt that `reclaim()` took back cannot record its outcome over the one that replaced it. The count is monotonic: `retryRun()` grants a fresh budget by raising `maxAttempts` rather than resetting the count, so no two attempts share a number                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Outcome and continuation commit together | Recording success or failure and firing `onSuccess` / `onFailure` are one transaction, so a stop between them cannot leave a paid-for report sitting in `approved`. The continuation is logged under the request id `$run:<runId>:<outcome>`, so a run continues its record at most once per outcome, and `retryRun()` refuses with `RUN_SETTLED` a run whose `onFailure` already moved the record on unless forced. Only that run: a dead or cancelled run, one without `onFailure`, or one whose continuation was refused is retried without `force` even if the record has left or re-entered the state since, so the caller checks the record first. Request ids starting with `$` are the library's own: `fire()` refuses a caller's with `INVALID_REQUEST_ID`, so no caller can spend or imitate a continuation's key |
| A continuation that is refused           | The record moved on (`RECORD_NOT_FOUND`, `INVALID_STATE`, `GUARD_REJECTED`, logged as a warning) or the continuation can never be fired as written (`INVALID_INPUT`, `INVALID_ROUTE`, `INVALID_SET`, `UNKNOWN_TRANSITION` and the like, logged as an error): the continuation is rolled back, the outcome is recorded, and the effect does not run again, because the same refusal would follow every attempt                                                                                                                                                                                                                                                                                                                                                                                                               |
| An outcome that cannot be recorded       | When that transaction fails — the continuation met a `CONFLICT`, or anything other than a lifecycle refusal, such as the store failing — the attempt goes back to `queued` after its backoff and is dispatched again. It stays claimed only if even that write fails. An `EffectFailure` whose `details` are not JSON is recorded as a failure without them                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lease and reclaim                        | A running attempt whose process stopped stays claimed until `leaseMs` (five minutes by default) passes. `reclaim()` takes such attempts back and hands them over, and also hands over a queued run that has been due for longer than a lease — its dispatch failed, or the timer waiting out its backoff died with its process. Run it on the same schedule as the triggers. A run naming an effect the process does not know is left for one that does. `recover()` does the same once at start and hands over everything queued, due or not                                                                                                                                                                                                                                                                               |
| Dead                                     | A run none of whose attempts recorded an outcome becomes `dead` instead of being queued forever, so an effect that crashes its process every time stops after `maxAttempts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Unknown effect                           | A run naming an effect this process has not registered stays queued; in a rolling deploy another process may know it. `listEffectRuns()` marks it `registered: false`, and `retryRun()` refuses it with `UNKNOWN_EFFECT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The default dispatcher runs each effect in process before `fire()` returns, which suits scripts; it runs a retry at once and does not wait out its backoff. The test kit's `InProcessDispatcher` from `@nocobase/lifecycle/testing` waits for the fake clock instead, or runs retries at once with `retries: 'immediate'`. Production hands runs to the jobs service through `@nocobase/lifecycle/jobs`; a job carries only the run id, and the state stays in the database.

## Trigger sweeps

`runTriggers()` asks each trigger's store for records in one of its `when` states whose `statusChangedAt` is older than `now − after`, oldest first, and fires the transition on each as the system.

- **No timer per record.** A restart loses nothing, and a changed wait applies on the next sweep.
- **Rechecked inside the transaction.** The fire carries `expect.changedBefore`; a record touched since it was read is no longer idle and is refused.
- **Safe on several instances.** Only one conditional update on a record can succeed.
- **Paged past refusals.** Records are read in pages keyed by `(changedAt, id)`, and `batchSize` counts transitions fired, not records looked at. A record whose guard refuses the trigger — a report already at the top approver — is passed over and cannot keep the records behind it from being reached, though it still costs one refused transaction per sweep.
- **Only "someone got there first" is swallowed.** `RECORD_NOT_FOUND`, `INVALID_STATE`, `GUARD_REJECTED` and `CONFLICT` are skipped. Anything else — a broken definition, a failing store — is logged, the sweep finishes the other records, and the error is thrown at the end, as an `AggregateError` when there were several.
- Every transition, a self-transition included, updates `statusChangedAt`, so an escalation starts the wait again.

## Storage

The runtime depends on the `LifecycleStore` interface and ships two implementations:

| Implementation                                | Use                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `MemoryLifecycleStore`                        | Tests and the test kit. Transactions are serialized through a queue, and a rollback undoes only the transaction's own writes |
| `createRepositoryLifecycleStore(db, options)` | Reads and writes the record's own collection through `@nocobase/db` Repositories, plus two collections                       |

The library ships no migration: the plugin that owns the lifecycles declares the tables in its own migration, which must stay self-contained. What they need:

| Table                   | Fields and indexes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The record's collection | The state field (`status` by default), `statusChangedAt` (`datetimeTz`) and `lifecycleVersion` (integer, not null, default 0). An index on `(status, statusChangedAt)` serves the trigger sweep                                                                                                                                                                                                                                                                                                                                                                                       |
| `lifecycleTransitions`  | `id`, `lifecycle`, `recordId`, `transition`, `from` (nullable), `to`, `actorId`, `input` (json), `at`, `version`, `requestId` (nullable), `requestKey` (not null). A unique index on `(lifecycle, recordId, version)`, and one on `(lifecycle, recordId, requestKey)`. `requestKey` is the entry's `requestId`, or `$v:<version>` when it has none, so the index never compares NULLs and is the same plain unique index on every dialect, Oracle, Dameng and MSSQL included, with no partial-index predicate. A caller's `requestId` cannot start with `$`, so the two never collide |
| `lifecycleEffectRuns`   | `id`, `transitionId`, `lifecycle`, `recordId`, `effect`, `status`, `attempts`, `maxAttempts`, `result` (json), `error` (text), `createdAt`, `updatedAt`, `claimedAt`, `runAfter`                                                                                                                                                                                                                                                                                                                                                                                                      |

The two table names are set through the `collections` option; the example plugins prefix them with their own names. `LIFECYCLE_COLLECTIONS` names the defaults, and the example migrations under `packages/examples/*/database/migrations/` are the shape to copy.

**SQLite:** a transaction holds the only connection. A guard, `route`, `set` or `onTransition` that reads another table through the database manager waits for that connection forever. Register the services as a factory and read through the handle it receives: `services: (handle) => ({ store: store.bound(handle) })`.

## Where an extension goes

Choose by whether it must succeed together with the state:

| Need                                   | Use                                                  | When it runs                      | On failure                                     |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| Refuse an action and say why           | `guard`; from another plugin, `runtime.addGuard()`   | In the transaction, before writes | Refused; the reason joins the blockers         |
| Write related rows with the state      | `set` (same record), `onTransition` (other tables)   | In the transaction                | The whole transition rolls back                |
| An external call that must happen      | `effects` / `onEnter`                                | After commit, retried             | Retried, then `failed`; `onFailure` may follow |
| Refresh a page, a to-do list, an index | `runtime.on('completed' \| 'entered' \| 'announce')` | After commit, best effort         | Logged, not redelivered                        |

## Changing a definition

The definition lives in source, but some of its names are written to the database: state values on records, lifecycle and transition names in the log, lifecycle and effect names on effect runs. Renaming them does not rename what is already stored.

| Change                                                  | Safe?           | Effect and procedure                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a state, transition, trigger or effect              | Yes             | The definition checks still apply: a new non-final state must be reachable and have a way out                                                                                                                                                                                                                                                           |
| Change the logic of `guard`, `validate`, `route`, `set` | Yes             | Only later operations see it; a record midway is judged by the new rule at its next step                                                                                                                                                                                                                                                                |
| Change a `parameters` default                           | Yes             | Immediate. A trigger's `after` uses the new value, for records already waiting too                                                                                                                                                                                                                                                                      |
| Change an effect's `retry` or `timeoutMs`               | Yes             | Existing runs keep the `maxAttempts` they were created with; backoff and timeout follow the current definition                                                                                                                                                                                                                                          |
| Rename a transition                                     | Mostly          | The old name in the log is history. Pages, API callers and the filters of `on()` and `addGuard()` that name it must change with it                                                                                                                                                                                                                      |
| Rename or remove a state                                | No              | Records still in the old state have no transition and are never swept; they are stuck. Do it in three releases: keep the old state, add the new one and a system-only transition from old to new; fire it on every record in the old state with a script, which leaves a log entry; once none remain, remove the old state and the migration transition |
| Rename or remove an effect                              | No              | Queued runs under the old name find no effect and stay queued (`registered: false`). Keep the old name registered until `listEffectRuns({ effect })` shows no queued or running run, then remove it; cancel with `cancelRun()` what need not run                                                                                                        |
| Rename a lifecycle                                      | Do not          | The log and the effect runs are keyed by lifecycle name; history disappears and old runs lose their lifecycle. To change only the table, change `collection` and rename the table in a migration                                                                                                                                                        |
| Change `stateField`, `changedAtField`, `versionField`   | Needs migration | Rename the columns in a migration in the same release                                                                                                                                                                                                                                                                                                   |

**Rolling deploys.** A process that does not know an effect run's effect leaves it queued for one that does, so a new effect can roll out without coordination. A new state makes old processes refuse operations on records in it (`INVALID_STATE`) until the deploy completes. Removals and renames follow the steps above, one release each.

## Deliberately not done

- **A visual designer.** Definitions live in source, checked by types and tests. `toMermaid(describe())` draws them for display.
- **Hierarchical states and parallel regions.** They would stop "what state is this record in" from being one field value. Where work runs in parallel, split it into child records with their own lifecycles.
- **Reliable event delivery.** Listeners are best effort; reliability is what effects are for, and there is one reliable mechanism, not two.
- **Migrations or a schema helper.** Migrations must be self-contained and immutable, so the owning plugin spells out its tables.
- **Permissions.** The library has no routes; the plugin's own routes authenticate and authorize ahead of the lifecycle's guards, with whatever access control the application uses.

Definitions are checked when the module loads: every state is reachable from an initial state, a final state has no way out, every other state has one, and `accept` names none of the fields the lifecycle manages.

## Influences

| Source                | What was taken                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Symfony Workflow      | Guards that return blockers with reasons; the `announce` event; metadata on states and transitions; export to a diagram |
| Statesman (Ruby)      | The transition log as the history; a per-record sequence number under a unique constraint                               |
| Transactional outbox  | Effect runs written in the business transaction and delivered after commit                                              |
| Fencing tokens        | Every attempt carries a number, and a reclaimed attempt cannot write its result                                         |
| HTTP idempotency keys | `requestId` returns the first result to a repeated request                                                              |
