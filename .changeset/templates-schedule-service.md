---
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
'@nocobase/app-skills': patch
---

Compose the schedule service, and replace `@nocobase/cron` with `@nocobase/schedule`

The templates add `ScheduleExecuteServiceProvider` to `server/app.ts`, a `server/config/schedule.ts` offering a `memory` and a `redis` configuration, and `@nocobase/schedule` as a dependency, and remove the Scheduler's `queues.schedule` queue connection. No configuration is the default: until `schedule.default` names one, scheduled jobs run on the built-in memory adapter — one process, its state written under `storage/schedule` when the application stops — and a warning reports it outside development. Set `schedule.default` to `redis` in `config.yml` to run several instances, each firing executed once; Redis must persist its data and use `maxmemory-policy noeviction`.

`@nocobase/cron` is no longer part of the templates or of this repository; its published 0.1.0 stays installable. Code that scheduled work with `createCronJobManager()` moves to an executor of its own, which also stops several instances from each firing the job:

```ts
import { scheduleExecuteServiceToken } from '@nocobase/app-server/schedule';

this.executor = this.app.container
  .resolve(scheduleExecuteServiceToken)
  .getScheduleExecutor('<your package name>');
await this.executor.addJob({
  name: 'overdue-scan',
  options: { cron: '0 8 * * *', tz: 'Asia/Shanghai' },
  payload: {},
  execute: async () => {
    /* ... */
  },
});
await this.executor.setup(); // in start(); call this.executor.shutdown() in shutdown()
```

The application development Skill describes this in its services and jobs reference, and the deployment Skill covers choosing the schedule backend.
