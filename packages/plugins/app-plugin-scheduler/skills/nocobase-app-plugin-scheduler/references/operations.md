# Operations and Verification

## The Business Administrator's Workflow

Developers maintain schedule definitions and execution logic. Business administrators use the application's task list and detail pages to track executions. Use meaningful business titles and descriptions, and reflect actual progress and final outcomes. Do not display asynchronous work as successful merely because it was queued. Workflow tasks can link to their associated run for further inspection.

Validate using an administrator account with the appropriate permissions: the task must be discoverable, execution records accessible, and final status consistent with business results. Background logs or successful dispatch receipts alone do not deliver this observability requirement.

## Management Entry Points

The list page is `/settings/automation/schedules`; details are at `/settings/automation/schedules/:scheduleId`. Definitions are maintained in source. The UI supports viewing and enabling/disabling tasks, with no API for creating or editing Cron definitions.

All routes below require authentication and authorization for `{ resource: { type: 'page', id: 'scheduler.schedules' }, action: 'access' }`. Enabling/disabling currently uses the same permission, not a separate update action.

| Method and path                      | Response / effect                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/schedules`                 | `{ data: ScheduleListItem[] }`                                                                                |
| `GET /api/schedules/:id/occurrences` | `{ data: ScheduleOccurrenceView[] }`; currently at most the latest 100 records, with no pagination parameters |
| `POST /api/schedules/:id/enable`     | `{ data: ScheduleListItem }`; enables the task, no request body                                               |
| `POST /api/schedules/:id/disable`    | `{ data: ScheduleListItem }`; pauses the task, no request body                                                |

Use the id returned by list for `:id`, not the definition key or workflowKey. Enabling/disabling affects future scheduling; it does not cancel already dispatched Queue Jobs or workflows.

Server code resolves `schedulerServiceToken` from `@nocobase/app-plugin-scheduler/server/tokens`. Its public methods are:

```ts
list(): Promise<readonly ScheduleListItem[]>;
listOccurrences(scheduleId: string): Promise<readonly ScheduleOccurrenceView[]>;
sync(finalize?: boolean): Promise<void>;
setEnabled(scheduleId: string, enabled: boolean): Promise<ScheduleListItem>;
```

Service calls do not automatically pass through HTTP authorization middleware. Application-owned Routes must enforce their own authorization. Do not bypass the Service through the internal store.

List items include id, owner, key, cron, timezone, enabled, lifecycleState, scheduleStatus, targetState, targetSummary, runCount, completedCount, and nextRunAt. Distinguish administrator pausing, inactivity after removal from code, and a missing/disabled/invalid target. An enabled definition does not prove its target is ready.

Execution history includes status, reason, executionCount, timestamps, controlled target references/receipts, and result summaries. List/API responses do not expose raw Job payloads or Workflow input. Workflow references can link to the associated run.

## Verify Behavior

Validate according to the change, beyond comparing synchronized Skill files:

- The definition module imports, typechecks, and builds. Synchronization succeeds, and the list shows the expected key, timezone, and next execution.
- In development, use a short Cron interval to observe an execution: a short Job produces its business result and succeeds; asynchronous Jobs/Workflows wait first and eventually reflect the real outcome.
- Check actual status and reason for invalid payloads and missing/disabled targets. Successful synchronization does not prove input validity.
- For asynchronous adapters, cover duplicate dispatch, the same reference for the same occurrence, successful completion, terminal failure after retries, and recovery through inspection after a lost notification. Verify a real worker can load the Job.
- Confirm enable/disable settings survive normal synchronization. Test finalization of removed definitions only in an authorized test environment.
- For custom pages or Routes, verify anonymous, unauthorized, and authorized access. Run relevant application lint, typecheck, tests, and build, and report unverified external-system boundaries.

Do not trigger production business effects merely to validate integration. Use a development environment or the application's existing test adapter.

## Diagnose Problems

- **Command missing:** check the Scheduler CLI contribution in `cli/plugins.ts`.
- **Definition absent:** check the Server contribution's packageName, relative definitions path, default array export, and built output. Use a composition inspector to diagnose paths if needed; it does not execute schedules.
- **Startup failure:** check the database Queue connection, migrations, duplicate keys/types/job names, Provider boot registration, and manifest validation errors.
- **No trigger:** check nextRunAt, timezone, from/to, limit, enablement, and lifecycleState, then confirm the application and worker are running. The sync-only command is not a background daemon.
- **Workflow does not execute:** check its directory key, current definition enablement, Artifact availability, and inputSchema. Schedule synchronization does not validate the entire workflow's readiness.
- **Stuck waiting:** follow the target reference and inspect the real executor, completion notification, and observer. Scheduler's periodic reconciliation does not perform the business worker's execution.
- **Historical triggered status:** this only indicates that a target previously accepted a request, not successful completion. runCount is not a success count either.
