---
'@nocobase/schedule': minor
'@nocobase/app-server': minor
---

Add `@nocobase/schedule`, persistent recurring jobs with one executor per consumer, and compose it under `@nocobase/app-server/schedule`

`createScheduleExecuteService(config, { appName, storagePath, logger, onFallback })` hands out executors by scope and configuration key. An executor stores each job's rule in a backend and runs its handler when the rule fires: `addJob(job, registerOnly?)` skips the write when the rule, payload and execution settings are unchanged, passes `immediately` only for a new job, and registers the handler alone with `registerOnly`; `removeJob` keeps the handler; `subscribe` reports the firings this instance ran, with `jobId`, `scheduledAt`, `runAt` and `nextRunAt`; a firing whose job has no handler fails once as `handler-not-registered`. Two adapters implement it. `redis` uses BullMQ 6.3.6 job schedulers through their public API only and runs each firing on exactly one instance. `memory` persists rules, next firings and counts to a versioned state file under `persistence.path` that the processes of one host share: reads take no lock, every change is a read-modify-write under a short exclusive lock, each firing is claimed under that lock so it runs once among them, and a file written from two hosts is refused. A missed firing runs once after a restart.

`@nocobase/app-server/schedule` exports `scheduleExecuteServiceToken`, `ScheduleExecuteServiceProvider` and `AppScheduleConfig`. The provider reads the `schedule` section, defaults `namespace` to the application name and the built-in memory configuration to `storage/schedule`, reports a fallback to that configuration outside `develop` and `development` (pass `{ nodeEnv }` when adding it), and shuts down executors their owners left running. `@nocobase/app-server` declares `@nocobase/schedule` as a peer; applications provide it.
