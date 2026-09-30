# Target Extensions and Execution Protocol

A schedule points at a target, and a target is the plugin's one extension point: `scheduler.registerTarget(target)` declares how a configuration is validated, how a firing starts, and — for work that finishes later — how a run is inspected and reported. Register targets in their owning Provider's `boot()`: all Providers have registered services, and Scheduler has not yet synchronized the manifest in `start()`. Do not resolve the container during module import or depend on another Provider's boot order to create services. Duplicate target types throw.

## Add an Ordinary Scheduled Task

This short task example can be used independently. Create `server/providers/scheduled-log.ts` in the application and add the Provider to its existing Provider array:

```ts
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

export default class ScheduledLogProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'app/scheduled-log';

  public override async boot(): Promise<void> {
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();
    scheduler.registerTarget({
      type: 'app.scheduled-log',
      title: 'Scheduled time report',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          typeof (config as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'message-must-be-a-string' };
      },
      async start(config, context) {
        logger.info(
          {
            message: config.message,
            scheduleId: context.scheduleId,
            occurrenceId: context.occurrenceId,
          },
          'Scheduled log',
        );
        return { state: 'completed', outcome: 'succeeded' };
      },
    });
  }
}
```

Use target `{ type: 'app.scheduled-log', config: { message: 'Time report' } }`. For business work, replace logging with a domain Service call and validate the complete config. Resolve Scheduler directly when it is required; use `container.has()` to skip registration only for a truly optional integration.

Namespace the type so it cannot collide with another plugin's: `app.` for an application's own tasks, the plugin name for a plugin's. Two registrations of the same type throw at boot.

Short operations may complete inside `start()`, but occupy the schedule worker. Submit lengthy work as a business job and return `accepted`, as the next section shows. Do not let config select arbitrary module paths or job names.

## Submit a Job and Track Its Completion

A target whose work runs elsewhere returns `accepted` with a reference, and the schedule occurrence waits until that run reaches a terminal state. Business jobs run on `@nocobase/jobs`: a class extends `Job<TPayload>`, declares a stable `static jobName`, and implements `execute(context)`. The owning Provider takes its own executor from `jobExecutorServiceToken` in `@nocobase/app-server/jobs` under its package name, registers the class before `setup()` in `start()`, and awaits `executor.shutdown()` in `shutdown()`. Nothing discovers job modules; the Provider imports them.

A job class receives only its payload, so a job that reports back to Scheduler closes over the handle: the Provider defines the class in a factory that captures the handle `registerTarget()` returned and the Services the work needs.

```ts
// Inside the Provider. `handle` came from registerTarget(); `maintenance` is a
// business Service that persists each occurrence's state and is idempotent.
const MaintenanceJob = class extends Job<{ occurrenceId: string }> {
  public static readonly jobName: string = 'maintenance';

  public async execute({ signal }: JobExecutionContext): Promise<void> {
    const { occurrenceId } = this.payload;
    const reference = { type: 'app.maintenance', id: occurrenceId };
    await maintenance.run(occurrenceId, signal);
    await handle.reportCompletion(occurrenceId, reference, {
      status: 'succeeded',
      finishedAt: new Date(),
    });
  }
};
```

The target's `start()` submits it and returns a reference derived from the occurrence:

```ts
await executor.addJob(
  new MaintenanceJob({ occurrenceId: context.occurrenceId }),
);
return {
  state: 'accepted',
  reference: { type: 'app.maintenance', id: context.occurrenceId },
};
```

This fragment requires a business job and Service; neither is built in. The executor has no deduplication, and a task can run again after failure or recovery, so carry `occurrenceId` as the idempotency key and let the Service skip an occurrence it has already completed. Recovering the start of the same occurrence must produce the same reference, which is why it is derived from the occurrence rather than from the job receipt.

Review the complete execution chain: submission → business job execution → terminal notification → persisted-state recovery. Scheduler runs its own schedule executor only; the business executor is set up by the owning Provider, and with the built-in memory jobs configuration its tasks run only in that process. Reconciliation observes execution state and cannot execute the business job.

In addition to submission and execution, an asynchronous target needs all of the following:

1. **Terminal notification:** call `handle.reportCompletion(occurrenceId, reference, completion)` after actual success or exhausted retries. A failed attempt that will retry is not terminal failure. The handle only completes occurrences its own target started, so keep it on the Provider rather than re-deriving it, and pass it to the job through the factory rather than the payload.
2. **Recovery queries:** implement `inspect(reference)` on the target and query persisted execution state. Reconciliation routes by the target type the occurrence recorded when it started, so a definition later retargeted elsewhere still inspects through the target that began the run.
3. **Reliable references:** notifications and inspection use the same `{ type, id }`, recoverable across processes. Do not use an in-process Map as the authoritative terminal state. Other execution systems use their own stable, non-conflicting reference types.

Job success does not automatically mark Scheduler success. Returning `accepted` alone is incomplete. A notification can be lost or arrive before acceptance is persisted; inspection compensates for these cases. Nothing observes a job for you.

## Historical Occurrences After Retargeting

Changing a definition's target affects later executions; it does not transfer ownership of an existing occurrence. For example, if a definition changes from `app.export` to `workflow` while an export is waiting, that occurrence still belongs to `app.export`.

A valid completion requires all three conditions together:

1. Use the handle registered for the original target type recorded on the occurrence, not the new definition target's handle. Keep the original target integration available while its executions remain outstanding; a process restart can register that same type again.
2. Supply the original occurrenceId and its accepted reference, matching both `reference.type` and `reference.id`. Knowing the occurrenceId or original target type alone is insufficient. An ownership or reference mismatch is rejected with `REFERENCE_MISMATCH`.
3. Report the real executor's terminal outcome, after success or final failure rather than an attempt that will retry. A duplicate report of the same terminal status is idempotent; a conflicting terminal status is rejected with `COMPLETION_CONFLICT`.

If notification arrives before the accepted reference is persisted, it can return without completing the occurrence. Verify persisted history and let `inspect()` recover the original execution's state. Recovery routes through the occurrence's recorded target type and reference; do not launch replacement work or rewrite history to make a callback match.

## The Target Contract

`ScheduleTargetType<TConfig>` is exported from `@nocobase/app-plugin-scheduler/server`, where TConfig is a JSON object:

| Member                      | Implementation requirements                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type` / `title`            | Stable, unique namespaced type name / display name; registering an existing type throws                                                                                                                                                                                                               |
| `validate(config: unknown)` | Synchronously validate JSON structure and return `{ valid, reason? }`; called during synchronization and execution startup                                                                                                                                                                            |
| `describe(config)`          | Optional; asynchronously return `{ targetLabel, description?, href?, state? }`, with state `ready/disabled/missing/invalid`; prefer an explicit state and perform no business side effects. Omitted, a target reads as its own title in the `ready` state, which suits a task that is always runnable |
| `start(config, context)`    | Start execution asynchronously, follow the result union below, and deduplicate using occurrenceId. Context carries only `scheduleId` and `occurrenceId` — no request user, container, scheduled time, or credentials                                                                                  |
| `inspect(reference)`        | Optional interface, but implement for asynchronous execution to recover actual executor state                                                                                                                                                                                                         |
| `referenceHref(reference)`  | Optional controlled detail path; encode ids and avoid unvalidated external URLs                                                                                                                                                                                                                       |

After registration, declare `target: { type: 'your-stable-type', config: { ... } }`. The extension owner handles parameters, business permissions, credentials, and the executor. Application integration does not require changing Scheduler's private registry, tables, or dispatch Job.

`registerTarget()` is the target extension surface. The target registry, the schedule store and the occurrence history are private to the plugin; read and change schedules through the HTTP API, and synchronize through `pnpm nocobase scheduler sync`.

## Shared Result Protocol

`start()` must return one of these four `ScheduleTargetStartResult` variants:

| Return value                                                           | Meaning                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `{ state: 'completed', outcome: 'succeeded', result?: JsonObject }`    | Business execution has succeeded; never use for merely queued work |
| `{ state: 'accepted', reference: { type, id }, receipt?: JsonObject }` | Accepted; Scheduler enters waiting until terminal completion       |
| `{ state: 'skipped', reason: string }`                                 | This execution should be skipped                                   |
| `{ state: 'failed', reason: string }`                                  | Startup or synchronous execution failed                            |

`inspect()` returns `ScheduleTargetObservation`: `{ state: 'pending' }`, `{ state: 'running' }`, `{ state: 'completed', completion }`, or `{ state: 'unknown', reason }`. Unknown is not success; a missing record is not proof of completion.

Completion has shape `{ status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out', reason?: string, result?: JsonObject, finishedAt?: Date }`, reported through the handle `registerTarget()` returned. Report the real terminal outcome without reversing an already completed state.

Keep receipts, results, reasons, references, and display information controlled and non-sensitive. Do not persist full business responses, inputs, or stack traces in these summaries.

Scheduler does not impose an observation deadline. Pending, running, or temporarily unobservable targets remain waiting until a terminal outcome is reported or observed. Execution timeouts belong to the target; report `timed_out` only when the target actually times out.
