---
"@nocobase/db": minor
"@nocobase/app-server": minor
"@nocobase/app-host": patch
---

Wait for a contended migration or seed lock instead of failing on the first conflict, report who holds it, and stop abandoning it held when a restart interrupts startup.

Acquiring the lock now retries with backoff until `lockAcquireTimeoutMs` — a new Migrator and Seeder option defaulting to 30 seconds — so the brief overlap between two starts resolves itself rather than surfacing as an error. A conflicting insert is treated as contention on its own: the previous implementation re-read the lock row to decide what to report, and a holder that released in between left the driver's `UNIQUE constraint failed` text as the whole explanation. When the wait does expire, the message names the holder recorded in `locked_by`, the time in `locked_at`, how long it waited, and that the row has to be deleted if the process holding it was killed. An insert that keeps failing while the lock table holds no row is still reported as the driver error it is, rather than being retried until the timeout.

Startup watches `SIGINT` and `SIGTERM` from before the application boots until the HTTP server registers its own handlers. Migrations and seeds run in that window, and Node's default disposition terminated the process outright, so a `tsx watch` restart triggered by a dependency install left the lock held by a process that no longer existed and the next start had to wait it out. The signal is now recorded, startup finishes and releases the lock the ordinary way, and the application shuts down instead of listening. A second signal still forces the exit. `watchStartupShutdownSignals` is exported for hosts that run their own startup sequence, and the app-host CLI uses it: its handlers were registered before the host existed, so a signal during startup exited the process immediately and abandoned the same locks.

Migrations and seeds share one lock implementation, so contention behaves and reports identically for both.
