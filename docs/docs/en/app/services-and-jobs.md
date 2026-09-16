---
title: 'Services and background jobs'
description: 'Scheduled work and long-running work.'
---

# Services and background jobs

This page explains the Scheduler feature for two audiences: application
developers who define schedules in code, and business administrators who
monitor the schedules in an App.

## Overview

A schedule runs an allowlisted target at the times described by a five- or
six-field Cron expression. The Scheduler plugin owns the timing, idempotency,
retry/observation state, and execution history. A target is either:

- a **Workflow**, identified by its stable workflow key; or
- a **Job**, identified by a Job name explicitly registered by server code.

Scheduler v1 is code-defined and read-only in the UI. An administrator cannot
create, edit, pause, or delete a schedule from the Scheduled Tasks page. Change
the declaration in the owning plugin and deploy it instead. This prevents a
production schedule from silently diverging from the application source.

## Quick start: ask the App Agent

In an App with the Scheduler and Workflow plugins enabled, an application
developer can ask the App Agent, for example:

> Create a workflow that records a timestamp, and run it every five minutes.
> Use the `Asia/Singapore` timezone, and show me how to verify the execution.

The agent should create or update the workflow and a server-owned schedule
definition. The resulting definition is equivalent to:

```ts
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';

export default [
  defineSchedule({
    key: 'record-timestamp-every-5-minutes',
    title: 'Record timestamp every 5 minutes',
    schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
    target: {
      type: 'workflow',
      config: { workflowKey: 'record-timestamp', input: {} },
    },
  }),
];
```

After the code is registered in the App, run `pnpm scheduler:sync` from the
application root. Open **Settings → Automation → Scheduled Tasks** and open the
task to check its next run. A due task first appears as `waiting` while an
asynchronous target is being observed, then becomes `succeeded`, `failed`,
`cancelled`, or `timed_out`.

## Add schedules in application development

### 1. Declare the schedule

Install `@nocobase/app-plugin-scheduler` as a peer and development dependency.
There is no Server plugin declaration field for schedules. Instead, resolve
`schedulerServiceToken` and call `defineSchedule(definition)` from your
Provider's `register()` or `boot()`, guarded the same way a target
registration is guarded, since the scheduler plugin might not be installed:

```ts
// server/providers/customer-sync.ts
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

export class CustomerSyncScheduleProvider {
  public readonly name = '@acme/customer-sync';

  constructor(private readonly app: AppPluginApplication) {}

  async boot() {
    if (!this.app.container.has(schedulerServiceToken)) return;
    this.app.container.resolve(schedulerServiceToken).defineSchedule({
      key: 'daily-customer-sync', // stable identifier; do not change casually
      title: 'Daily customer sync',
      description: 'Starts the customer synchronization workflow.',
      schedule: {
        cron: '0 2 * * *',
        timezone: 'UTC',
        // Optional: from, to, and limit are inclusive / positive respectively.
      },
      target: {
        type: 'workflow',
        config: { workflowKey: 'customer-sync', input: {} },
      },
    });
  }
}
```

`key` is an application-wide stable identifier and forms the schedule's
persistent identity together with the application name. Use a namespaced key
such as `sales.daily-report` when the application contains multiple business
modules. Both `register()` and `boot()` run, across every plugin, before the
scheduler reads what was registered during its own `start()`, so it does not
matter which plugin's Provider runs first — only that `defineSchedule()` is
called before `start()`.

Keys must be stable identifiers. Cron expressions contain five or six fields
and use an IANA timezone (for example `Asia/Singapore`) or `UTC`. `from` and
`to` are inclusive. `limit` limits schedule claims; it does not limit the
number of workflow steps or target completions. Do not put passwords, API
keys, access tokens, credentials, or other secrets in `target.config`.

Run `pnpm scheduler:sync` after installing or changing a declaration. It
validates the complete manifest and performs non-destructive upserts. During a
deployment that has loaded the complete set of plugins, run
`pnpm scheduler:sync --finalize` once to soft-deactivate definitions that are
no longer present. Never edit `schedule_definitions`, `queue_schedules`, or
`schedule_occurrences` directly.

### 2. Choose the target type

#### Workflow target

Use `type: 'workflow'` and provide the workflow's stable `workflowKey` plus a
JSON object as `input`. The Workflow plugin validates the key and starts a
workflow run with the schedule occurrence as its idempotency key. A disabled or
missing workflow is shown as a target issue and will not run successfully.

#### Code target

Register your own target when the operation belongs in server code. The owning
plugin registers it with the Scheduler service during its Provider `boot()`
lifecycle, under a namespaced type of its own. The registration validates the
config and returns either a synchronous completion or an accepted queue
reference:

```ts
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

export class CustomerSyncProvider {
  constructor(private readonly app: AppPluginApplication) {}

  async boot() {
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    scheduler.registerTarget({
      type: 'customer-sync',
      title: 'Customer sync',
      validate: (config) =>
        config && typeof config === 'object'
          ? { valid: true }
          : { valid: false, reason: 'invalid-config' },
      async start(config, context) {
        await runCustomerSync(config, {
          idempotencyKey: context.occurrenceId,
        });
        return { state: 'completed', outcome: 'succeeded' };
      },
    });
  }
}
```

The schedule then names the registered target and its JSON config:

```ts
target: {
  type: 'customer-sync',
  config: { full: false },
}
```

Do not let config select arbitrary queue Job names. A target that dispatches to
a queue should use `context.occurrenceId` as its deduplication key and
implement `inspect(reference)` so Scheduler can recover a missed completion
notification after a worker failure. `registerTarget()` returns a handle whose
`reportCompletion()` is how work that finishes later is reported back.

### 3. Verify a deployment

Check that synchronization succeeds, the task appears in the Scheduled Tasks
page, the next-run time uses the declared timezone, and one due occurrence
creates one execution record. Re-running a worker must reuse that occurrence
rather than creating a duplicate.

## For business administrators

Grant the user the `scheduler.schedules:access` permission. Then open
**Settings → Automation → Scheduled Tasks**. The list shows the schedule name,
Cron description and timezone, target type, run count, last run, next run, and
an overall status:

- **Active** — enabled schedule with a usable target;
- **Paused** — disabled schedule or paused queue projection;
- **Inactive** — removed from the complete code manifest after `--finalize`;
- **Target issue** — the target is missing, disabled, or invalid.

Use search and the status/target filters to find a task. Select a task to open
its details. The detail page shows the schedule definition, target summary,
next and last run, and the execution list. Each record includes the start time,
duration, target link when available, and status:

- `waiting`: the target accepted the request and Scheduler is observing it;
- `running`: the Scheduler dispatch is currently executing;
- `succeeded`: the target completed successfully;
- `failed`: dispatch or target execution failed;
- `skipped`: the target was intentionally unavailable or disabled;
- `cancelled` / `timed_out`: the target ended without success;
- `triggered`: legacy history where the target accepted the request but its
  final result is unknown.

The page deliberately does not show Workflow input or Job payloads. If a task
is inactive or has a target issue, contact the application developer; fixing
the source declaration and synchronizing the App is required. The UI is a
monitoring surface, not an operation console.
