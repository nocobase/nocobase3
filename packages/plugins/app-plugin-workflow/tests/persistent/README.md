# Persistent Workflow acceptance

This suite is opt-in, not a skipped test in the ordinary suite. The normal suite runs `tests/persistent-fixture.test.ts` against the real in-memory queue, including the registered business-effect instruction, and checks the durable SQLite business operation; it does not claim persistent queue coverage. `scripts/test-persistent.mjs` selects only `tests/persistent/restart.test.ts` and rejects an empty, failing, skipped, or todo run.

## Run serially with isolated queue infrastructure

The orchestrating queue runner must create its own Redis container, keep it alive for this command, and tear it down afterwards. Do not point this test at a developer's existing service. This script starts no Docker containers and supplies no default ports. It requires the queue runner's `QUEUE_TEST_RUN` (`nbq-…`), `QUEUE_TEST_BACKEND`, and `QUEUE_TEST_REDIS_PORT` loopback port. Use one target at a time, after any other database integration runner has finished.

```bash
# Inherit QUEUE_TEST_RUN and QUEUE_TEST_REDIS_PORT from the isolated Redis runner.
QUEUE_TEST_BACKEND=redis pnpm --filter @nocobase/app-plugin-workflow exec node scripts/test-persistent.mjs redis
```

Each invocation generates a unique namespace and temporary application directory. Only its own two logical queues are obliterated. The application business database is a real SQLite file reused by every fresh child process; Workflow resources are immutable, digest-addressed artifacts on disk. No install or rebuild is required.

## What the test proves

1. A real `Application` starts the production Database, Queue, and Workflow providers, enables an actual artifact, and calls the public Workflow trigger API. A scheduling-only wrapper adds a long delay to the real producer call so the test can confirm the accepted run is queued and its native backend job is delayed, without a timing race. No queue dispatch or engine is mocked.
2. A different artifact revision becomes current before the first process shuts down and exits. A fresh process checks that the same queue job still exists, promotes that job to waiting, and starts a new application against the same namespace, SQLite file, and artifact store. The actual Workflow `run` instruction completes using the original revision and input. The test asserts the persisted revision ID/hash, input, terminal output, node result, finished timestamp, single run, and completed native job. It does not insert a run record or rely on startup recovery to republish it.
3. A separate application-owned queue handler commits a business effect and attempt audit in one SQLite transaction, then deliberately throws before acknowledgement. Native backend state must show that same job delayed with one failed attempt. After that process exits, another fresh application consumes the promoted retry. The durable attempt audit must contain two different process IDs, while the uniquely keyed business-effect table still contains one original effect with the original payload. No second publish, queue `retry()` call, process-local Set, or fake adapter produces the redelivery.

4. A second test uses a separate namespace and SQLite file to test actual Workflow engine redelivery. The production `WorkflowProvider` creates the service; `WorkflowService.registerInstruction()` registers a real instruction that commits the durable business operation from `processor.execution.input`. The public Workflow trigger API publishes one task. A typed test-only wrapper around the real Workflow consumer registration awaits the original handler, records its completed dispatch and process ID, then throws outside the engine before the queue worker can acknowledge. Native state must show that exact job delayed with `attemptsMade === 1`, while the run and node are already RESOLVED with the expected result, finished timestamps, and one durable effect.
5. After that process exits, a new application promotes and consumes the same backend job without triggering or enqueueing another Workflow. The real engine handler is called again, in a distinct process, with the same execution ID. Native state must become completed with `attemptsMade === 2`; the full persisted run and node snapshots must be unchanged, with exactly one run and node in the database. The durable attempt audit and effect table must each still have one row owned by the first process. This proves terminal-run idempotency in the actual engine, not merely idempotency in an unrelated consumer.

The independent consumer test proves application-owned business-key deduplication across two actual effect invocations. The engine test proves a different boundary: the real instruction executes once, the queue handler executes twice, and terminal-run suppression prevents another effect invocation. Neither claim is framework exactly-once execution. The engine converts instruction exceptions into persisted Workflow failures (`Processor.exec()` and `Dispatcher.process()` catch them), so throwing inside an instruction would not faithfully cause a queue retry. The test deliberately injects its error after the real handler returns, not from the instruction and not by replacing engine dispatch with a fake.

## Remaining limits

This does not certify retrying an instruction that committed its effect but did not persist its terminal node/run state, recovering a killed STARTED instruction, vanished queue locks, or concurrent consumers. In particular, `Dispatcher.resolveAndProcessTask()` ignores an ordinary task for an already STARTED run; a process crash in that window must not be described as covered by terminal-run redelivery. Redis persists the queued job across application-process restarts in this suite; the Redis server itself is not restarted. The queue runner's Redis configuration intentionally disables disk persistence.

## Local checks without Redis or Docker

```bash
pnpm --filter @nocobase/app-plugin-workflow exec vitest run tests/persistent-fixture.test.ts
pnpm --filter @nocobase/app-plugin-workflow exec tsc -p tsconfig.persistent-tests.json
pnpm --filter @nocobase/app-plugin-workflow lint
pnpm --filter @nocobase/app-plugin-workflow typecheck
pnpm --filter @nocobase/app-plugin-workflow build
```
