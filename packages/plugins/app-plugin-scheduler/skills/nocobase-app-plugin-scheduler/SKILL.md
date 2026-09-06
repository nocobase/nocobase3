---
name: nocobase-app-plugin-scheduler
description: Use the Scheduler plugin to declare code-owned Cron schedules, register allowlisted Job targets, or synchronize schedule manifests in a NocoBase App.
metadata:
  short-description: Declare and synchronize scheduled automation
---

# Scheduler App Plugin

Use this Skill when the user wants an App or plugin to run an allowlisted Job
or Workflow on a Cron schedule. Do not use it to create database-owned or
administrator-editable schedules; Scheduler v1 is code-defined and read-only.

## Public surfaces

- Definition APIs: `defineSchedule`, `ScheduleDefinition`, and the target and
  Job registration contracts from `@nocobase/app-plugin-scheduler/server`.
- App services: `scheduleTargetRegistryToken` and
  `jobDispatchRegistryToken` from
  `@nocobase/app-plugin-scheduler/server/tokens`.
- Server contribution: `schedules: { definitions: './server/schedules' }` on
  the declaring plugin's `defineServerPlugin()` declaration.
- Operations: the App-owned `scheduler:sync` script, with optional
  `--finalize`.
- Product surface: the authenticated and authorized read-only Scheduled Tasks
  Settings page and `/api/schedules` endpoints.

## Declare a schedule

1. Add the Scheduler package as a peer and development dependency of a plugin,
   then register Scheduler Client and Server contributions in the App.
2. Create a plugin-owned module that default-exports an array of
   `defineSchedule(...)` results. Use a stable `key`, a five- or six-field Cron
   expression, and `UTC` or an IANA timezone.
3. Expose that module from the declaring Server plugin with
   `schedules: { definitions: './server/schedules' }`.
4. Select an installed target type. The Workflow plugin owns `workflow`; the
   Scheduler plugin owns `job`.
5. Run `pnpm scheduler:sync`, then verify the schedule in the read-only
   Scheduled Tasks page.

`from` and `to` are inclusive. `limit` counts Queue schedule claims, not target
completion. Never put passwords, tokens, API keys, or other secrets anywhere
inside `target.config`: definitions with fields that may contain credentials
are rejected, and target config must not contain credentials.

## Register an allowlisted Job target

During the owning plugin Provider's `boot()` lifecycle, resolve the original
`jobDispatchRegistryToken` and register a stable Job name, title, payload
validator, and dispatch function. The dispatch function should use the
Schedule execution context's `occurrenceId` as the downstream Queue dispatch
dedup/idempotency key and return only a controlled receipt such as a Job ID.
Do not expose arbitrary Queue Job names and do not resolve a private Scheduler
implementation.

Registration belongs in `boot()` so all Providers have registered their
services before target types are assembled. A Job target works without the
Workflow plugin. The fixed `ScheduleDispatchJob` and its Database schedule are
Scheduler infrastructure and must not be replaced by a business Job name.

## Synchronize safely

- `pnpm scheduler:sync` validates the complete loaded manifest and performs
  non-destructive upserts. Normal App startup also follows this path before
  starting the Schedule worker.
- Run `pnpm scheduler:sync --finalize` once per App during a production
  deployment only when the process sees the complete manifest. It additionally
  soft-deactivates missing code definitions.
- The one-shot sync command does not start the Schedule worker. A validation,
  import, or write failure rolls back the reconciliation and must not
  deactivate missing definitions.

Do not edit `schedule_definitions`, `queue_schedules`, or
`schedule_occurrences` directly. The plugin owns those projections and trigger
history. The App owns plugin registration, schedule declaration
modules, business Job payloads, and deployment timing for finalize.

## Permissions and observable results

Schedule APIs require authentication and `scheduler.schedules:access`.
Responses expose controlled scheduling data, while the Settings UI shows
localized schedule descriptions, trigger counts, and trigger history. Neither
surface exposes raw Job payloads or Workflow input. “Triggered” means the target
accepted the request; it does not mean downstream work completed.

Verify that synchronization succeeds, the Settings page shows the expected
next run, a due schedule creates one trigger record, and stalled execution
reuses the same occurrence record. For a Job registration, verify the Queue
dispatch receives `occurrenceId` as its dedup key. Use composition inspectors
only to diagnose missing declarations or registration; they do not execute a
schedule.

The plugin's `skills/` directory is the source of truth. Never edit the
synchronized App copy under `.agents/skills/`.
