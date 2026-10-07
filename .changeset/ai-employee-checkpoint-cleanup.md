---
'@nocobase/app-plugin-ai-employee': minor
---

Release the agent checkpoints of conversations nobody has used for a week, every day at 03:00 UTC, through a recurring job on the application's jobs service. A released conversation keeps all of its messages: its next run rebuilds the context from its latest 50 stored messages onto a fresh thread, and goes on from checkpoints again after that. A conversation waiting on a tool decision is never released, and neither is one a run starts on while the job examines it. The new `ai.checkpointCleanup` section sets `enabled`, `cron`, `tz`, `retentionDays`, `batchSize` and the `jobs` configuration to run on; an invalid section is a `config check` error and the plugin refuses to start on it.

The plugin now declares `@nocobase/jobs` as a peer dependency. The application templates already depend on it; an application created before them adds `@nocobase/jobs` to its `dependencies` and `JobExecutorServiceProvider` to `server/app.ts`. Without the jobs service the application still starts, without the cleanup, and logs a warning.
