# Host persistent queue competition acceptance

This suite is separate from the ordinary Host unit suite. It creates two actual `Application` instances through `AppRuntimeRegistry` factories with `LoggingProvider` and `QueueServiceProvider`. Both applications use the same explicit namespace, backend, connection target, and logical queue, while keeping distinct containers and queue services. There is no memory fallback and no mocked queue or factory replacement.

With concurrency one, each handler holds its claim on a separate barrier. Publishing two jobs through the first application's producer must produce one distinct claim per application, not a broadcast of the same job. The test releases only the first barrier and destroys the first application while the second still owns an uncompleted, uncancelled claim. The surviving application must keep the same runtime version and service identity, publish another job, complete its held claim, and consume the new job. Final checks after both applications shut down require exactly three distinct deliveries and completions, with the post-destroy job delivered only to the second application.

## Run against externally supplied infrastructure

Run these commands from the repository root, **one at a time**, only after the current queue integration owner releases the shared infrastructure slot. The runner never starts or stops Docker or a database. Supply ports for disposable loopback services; never point it at production. Redis uses database 0 without authentication. PostgreSQL uses database/user `postgres`, password `queue-test-only`, and the queue backend's default `bullmq` schema. The PostgreSQL service must permit the backend's normal migrations. Each run uses a fresh namespace; completed/failed jobs are removed, but backend queue metadata may remain until the external fixture is discarded.

```bash
QUEUE_TEST_REDIS_PORT=<externally-supplied-redis-port> \
  pnpm --filter @nocobase/app-host exec node tests/run-persistent-queue.mjs redis

QUEUE_TEST_PG_PORT=<externally-supplied-postgres-port> \
  pnpm --filter @nocobase/app-host exec node tests/run-persistent-queue.mjs postgres
```

The runner builds Host first because these tests import `dist`, then runs only `vitest.queue-persistent.config.ts`. It rejects missing/invalid ports, unsupported targets (including memory), empty runs, failures, skips, and todos, and enforces a child-process timeout. `QUEUE_TEST_BACKEND` is set from the explicit positional argument rather than inherited. The ordinary `pnpm --filter @nocobase/app-host check` excludes this integration directory and does not establish persistent-backend acceptance.
