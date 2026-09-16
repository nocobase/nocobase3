# @nocobase/app-plugin-scheduler

Code-defined scheduling for NocoBase applications.

A plugin or application registers a schedule by resolving `schedulerServiceToken`
and calling `defineSchedule(definition)` during `register()` or `boot()`,
the same way it calls `registerTarget()`:

```ts
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';

public override async boot(): Promise<void> {
  if (!this.app.container.has(schedulerServiceToken)) return;
  this.app.container.resolve(schedulerServiceToken).defineSchedule({
    key: 'daily-sync',
    title: 'Daily sync',
    schedule: { cron: '0 0 2 * * *', timezone: 'UTC' },
    target: {
      type: 'workflow',
      config: { workflowKey: 'daily-sync', input: {} },
    },
  });
}
```

The plugin reconciles declarations into `schedule_definitions` and the schedule projection owned by the application's configured `schedule` Queue. The App selects the Queue connection and driver; Scheduler does not force a Database Queue connection. The selected driver must support scheduled jobs, so the `sync` driver is not valid for this queue. Scheduler dispatches targets through a fixed `ScheduleDispatchJob`, records idempotent occurrences through their final target outcome, and provides an authenticated, authorized, read-only Settings page and API. Raw target config is never returned by the API.

`schedulerServiceToken` is the plugin's whole extension surface, with two methods. `registerTarget()` declares what a schedule can point at: how a config is validated, how a firing starts, and how a run that finishes later is inspected, and it returns the handle that reports a terminal outcome. `defineSchedule(definition)` registers a schedule itself; `key` must be unique within the application and forms the schedule's stable identity. Both are read once when the App syncs during startup, so call them from `register()` or `boot()`. Reading and changing schedules afterward is reachable through the HTTP API and the `schedule sync` command rather than through the service.

Run a non-destructive synchronization with `pnpm nocobase schedule sync`. A deployment
may run `pnpm nocobase schedule sync --finalize` once per App to deactivate declarations
missing from the complete manifest. The one-shot command does not start the
Schedule worker.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-scheduler lint
pnpm --filter @nocobase/app-plugin-scheduler typecheck
pnpm --filter @nocobase/app-plugin-scheduler test
pnpm --filter @nocobase/app-plugin-scheduler build
```
