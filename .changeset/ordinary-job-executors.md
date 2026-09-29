---
"@nocobase/jobs": minor
"@nocobase/app-server": patch
"@nocobase/app-skills": patch
---

Add one-off `JobExecutor` tasks alongside recurring `ScheduleExecutor` rules through the existing application jobs provider and service token. Jobs declare an own stable static `jobName`, accept only payload in their constructors, and reconstruct a fresh instance for every attempt from a strict JSON snapshot. Consumers register classes before setup; producer-only executors use `setup({ consume: false })`.

Isolate ordinary tasks by resolved configuration key and scope, using separate Redis queues and pending-only memory snapshots without changing existing Schedule identity. Report local attempt events, preserve explicitly interrupted work for recovery, and complete successful handlers even when shutdown has aborted their signal. Memory persistence remains setup-read and shutdown-write, so forced exits can lose new tasks or replay work completed since the last snapshot.

Document ordinary and recurring executor ownership in app-server and update application-development guidance to distinguish payload-only tasks from the unchanged queue-job and Scheduler APIs.
