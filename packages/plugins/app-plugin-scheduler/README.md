# @nocobase/app-plugin-scheduler

Code-defined scheduling for NocoBase applications.

Schedules are declared with `defineSchedule()` in a plugin-owned module and
exposed through that plugin's Server declaration:

```ts
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';

export default [
  defineSchedule({
    key: 'daily-sync',
    title: 'Daily sync',
    schedule: { cron: '0 0 2 * * *', timezone: 'UTC' },
    target: {
      type: 'workflow',
      config: { workflowKey: 'daily-sync', input: {} },
    },
  }),
];
```

```ts
defineServerPlugin({
  packageName,
  schedules: { definitions: './server/schedules' },
});
```

The plugin reconciles declarations into `schedule_definitions` and the
Database Queue schedule projection. It dispatches targets through a fixed
`ScheduleDispatchJob`, records idempotent triggers, and provides an
authenticated, authorized, read-only Settings page and API. Raw target config
is never returned by the API.

Run a non-destructive synchronization with `pnpm scheduler:sync`. A deployment
may run `pnpm scheduler:sync --finalize` once per App to deactivate declarations
missing from the complete manifest. The one-shot command does not start the
Schedule worker.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-scheduler lint
pnpm --filter @nocobase/app-plugin-scheduler typecheck
pnpm --filter @nocobase/app-plugin-scheduler test
pnpm --filter @nocobase/app-plugin-scheduler build
```
