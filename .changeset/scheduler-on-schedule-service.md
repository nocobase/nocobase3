---
'@nocobase/app-plugin-scheduler': minor
---

Schedule through `@nocobase/schedule` instead of the queue's schedule projection

**Breaking.** Scheduler hands each schedule's rule to its own executor from `@nocobase/app-server/schedule`, on the `@nocobase/app-plugin-scheduler` scope with one firing at a time and a single attempt. `ScheduleDispatchJob` is no longer exported, the plugin contributes no queue jobs and needs no `schedule` queue, and it depends on `@nocobase/schedule` as a peer. A new migration adds `nextRunAt`, `lastRunAt`, `runCount`, `appliedLimit` and `lastOccurrenceId` to `scheduleDefinitions` and `scheduledAt` to `scheduleOccurrences`.

- **No migration from the queue.** Rules are not carried over from `queue_schedules`, nor pending jobs from `queue_jobs`. Each schedule's rule is written again on the next start and its run count starts from zero; its definition, enablement and occurrence history are kept.
- **One run per firing across instances** on the `redis` schedule adapter. On `memory`, the built-in default, schedules run on one host, and `nb3 schedule:sync` cannot run while the application holds the state file's lock.
- **Occurrences.** An occurrence's id is the firing's job id, so a firing delivered twice records and starts its target once. A target that is not ready now records a `skipped` occurrence instead of failing.
- **Limits.** Disabling and re-enabling a schedule, or changing its definition, continues from the firings already run rather than restarting its limit.

Upgrading: compose `ScheduleExecuteServiceProvider` in `server/app.ts`, declare `@nocobase/schedule` as a dependency, add a `schedule` configuration — `redis` for more than one instance — and remove the `queues.schedule` connection the queue configuration kept for Scheduler. The application templates do all of this.
