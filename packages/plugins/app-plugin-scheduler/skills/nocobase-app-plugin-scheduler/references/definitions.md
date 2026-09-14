# Definitions, Registration, and Synchronization

## Prerequisites and Application Registration

Declare application Server packages in `dependencies`. Business plugins consuming Scheduler use `peerDependencies` and import the original Tokens rather than creating same-named Tokens. Installing a package does not enable it. Preserve existing registrations and add the default export of `@nocobase/app-plugin-scheduler/server` to `server/plugins.ts`. Register `@nocobase/app-plugin-scheduler/client` in `client/plugins.ts` for administrator UI observability. The synchronization command requires `@nocobase/app-plugin-scheduler/cli` in `cli/plugins.ts`.

Scheduler requires a Queue connection named `database` with `driver: 'database'`, and completed application migrations. It starts its own `schedule` worker, not workers for every business queue.

Add this contribution using the application's existing composition in `server/plugins.ts`, preserving the existing array:

```ts
import { defineServerPlugin } from '@nocobase/app-server/plugins';
import packageMetadata from '../package.json' with { type: 'json' };

const appSchedules = defineServerPlugin({
  packageName: packageMetadata.name,
  schedules: { definitions: './server/schedules' },
});
// Add appSchedules to the existing defineServerPlugins([...]).
```

A business plugin adds the same `schedules` field to its own `defineServerPlugin()` declaration. Paths are relative to the declaring package. Build and publish the module, which must default-export an array of `defineSchedule()` results. Add application Providers to the existing `server/providers/index.ts` array; plugin Providers belong in their own `serviceProviders` contribution.

## Declare Either Target

In `server/schedules.ts`:

```ts
import {
  defineSchedule,
  type NormalizedScheduleDefinition,
} from '@nocobase/app-plugin-scheduler/server';

const schedules: readonly NormalizedScheduleDefinition[] = [
  defineSchedule({
    key: 'daily-maintenance',
    title: 'Daily maintenance',
    schedule: { cron: '0 2 * * *', timezone: 'Asia/Shanghai' },
    target: {
      type: 'job',
      config: { jobName: 'app.maintenance', payload: { batchSize: 100 } },
    },
  }),
  defineSchedule({
    key: 'daily-reconciliation',
    title: 'Daily reconciliation workflow',
    schedule: { cron: '0 3 * * *', timezone: 'Asia/Shanghai' },
    target: {
      type: 'workflow',
      config: { workflowKey: 'daily-reconciliation', input: {} },
    },
  }),
];
export default schedules;
```

Implement and register these targets first. Keep only the definitions the application needs.

| Field                   | Current contract                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                   | Required; matches `^[A-Za-z0-9][A-Za-z0-9._:-]*$`; unique within an owner. Application name, owner, and key form persistent identity, so renaming is not an in-place update |
| `title` / `description` | Required title / optional description                                                                                                                                       |
| `schedule.cron`         | Five fields starting with minutes, or six starting with seconds; `*/5 * * * *` runs every five minutes, `*/10 * * * * *` every ten seconds                                  |
| `schedule.timezone`     | Defaults to `UTC`; use an explicit IANA timezone and consider daylight saving changes for local business time                                                               |
| `schedule.from` / `to`  | Optional inclusive `Date` boundaries; construct from ISO timestamps with explicit timezone offsets; from must not exceed to                                                 |
| `schedule.limit`        | Optional positive integer; counts Queue schedule claims, not successful completions                                                                                         |
| `target.type`           | A registered type: built-in `job`, `workflow` with Workflow installed, or a custom type                                                                                     |
| `target.config`         | JSON object; no functions, Service instances, or credentials. Sensitive field names are rejected recursively                                                                |

`defineSchedule()` validates and normalizes the definition, defaults the timezone, computes a hash, and freezes the result. Do not construct the hash manually or mutate the returned object. There are no `enabled`, `retry`, or `overlap` declaration fields; do not insert Queue options or fields from another scheduling framework.

The `job` config must be `{ jobName: string, payload: JsonObject }`, with an allowlisted jobName. Synchronization checks name registration; business payload validation happens during dispatch. Successful synchronization does not prove the payload is valid.

The `workflow` config is `{ workflowKey: string, input?: JsonObject }`, with input defaulting to `{}`. The key is the workflow source directory name, not its title or database revision id. Complete workflow checking, Artifact build, synchronization, and enablement separately; schedule synchronization does not perform these steps. Triggers use the current version, and its input schema validates input.

The Workflow plugin registers its target adapter and handles completion notifications. It uses `schedule:<scheduleId>:<occurrenceId>` as eventKey and records `sourceType: 'schedule'` with occurrenceId. Recovery of the same trigger reuses the existing run; do not trigger another workflow independently. For missing or disabled targets and invalid input, inspect the actual occurrence status and reason.

## Synchronization and Deployment

Run from the target application root:

```bash
pnpm nocobase schedule sync --json
```

Success returns `{ ok: true, status: 'success', finalize: false }`; also inspect the exit code for failures. The command starts the application for synchronization and then shuts it down, without starting Scheduler's schedule worker. Normal application startup also performs non-destructive synchronization before starting the worker.

Normal synchronization validates the complete loaded manifest and upserts definitions without deactivating missing ones. It preserves existing administrator enable/disable settings. During production deployment, once the complete manifest is available, run once per application:

```bash
pnpm nocobase schedule sync --finalize --json
```

This additionally soft-deactivates definitions removed from code, preserving history. Never finalize from a process that loads only some plugins. Import, validation, or write failures must not commit partial reconciliation. Finalization and temporary administrator disabling are distinct operations.
