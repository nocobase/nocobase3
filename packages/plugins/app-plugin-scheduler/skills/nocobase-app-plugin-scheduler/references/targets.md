# Target Extensions and Execution Protocol

Register targets and business Jobs in their owning Provider's `boot()`: all Providers have registered services, and Scheduler has not yet synchronized the manifest in `start()`. Do not resolve the container during module import or depend on another Provider's boot order to create services. Duplicate job names or target types throw.

## Add an Ordinary Business Job

This short task example can be used independently. Create `server/providers/scheduled-log.ts` in the application and add the Provider to its existing Provider array:

```ts
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { jobDispatchRegistryToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

export default class ScheduledLogProvider extends ServiceProvider<Application> {
  public readonly name = 'app/scheduled-log';

  public override async boot(): Promise<void> {
    const jobs = this.app.container.resolve(jobDispatchRegistryToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();
    jobs.register({
      name: 'app.scheduled-log',
      title: 'Scheduled time report',
      validate(payload) {
        return payload !== null &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          typeof (payload as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'message-must-be-a-string' };
      },
      async dispatch(payload, context) {
        logger.info(
          {
            message: payload.message,
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

Use target `{ type: 'job', config: { jobName: 'app.scheduled-log', payload: { message: 'Time report' } } }`. For business work, replace logging with a domain Service call and validate the complete payload. Resolve Scheduler directly when it is required; use `container.has()` to skip registration only for a truly optional integration.

`ScheduleJobRegistration` is exported from `@nocobase/app-plugin-scheduler/server`:

- `name` and `title` provide the stable identifier and display name.
- `validate(payload: unknown)` returns `{ valid: boolean, reason?: string }` synchronously; it does not transform payload.
- `dispatch(payload, context)` returns `Promise<ScheduleTargetStartResult>`. Context contains only `scheduleId` and `occurrenceId`, with no request user, container, scheduled time, or credentials.

Short operations may complete inside dispatch, but occupy the schedule worker. Dispatch lengthy work to a business queue. Do not introduce a target type for each ordinary Job or let config select arbitrary module paths or unregistered Queue Job names.

## Dispatch a Queue Job and Track Its Completion

Business Queue Jobs extend `Job<TPayload>` from `@nocobase/queue`, implement `execute(): Promise<void>`, and declare a stable `static options.name` and business queue. Plugins contribute discovery locations through `queue: { jobs: ['./server/jobs'] }`. Applications follow their existing Queue registration pattern. Ensure the build includes Job modules and a real worker consumes the selected connection/queue.

The adapter resolves `queueManagerToken` from `@nocobase/app-server/queue` and dispatches the actual Job class:

```ts
// queue and MaintenanceJob are actual objects resolved/imported by the Provider.
const queued = await queue.dispatch(
  MaintenanceJob,
  {
    ...payload,
    occurrenceId: context.occurrenceId,
  },
  {
    dedup: { id: context.occurrenceId },
  },
);
return {
  state: 'accepted',
  reference: { type: 'queue-job', id: queued.jobId },
};
```

This fragment requires a business Job implementation; MaintenanceJob is not built in. Carry occurrenceId through retries as the idempotency key. Recovering dispatch of the same occurrence must recover the same execution reference. Queue deduplication does not replace business idempotency for external effects.

An asynchronous adapter needs all of the following:

1. **Terminal notification:** call `jobs.reportCompletion(occurrenceId, reference, completion)` after actual success or exhausted retries. A failed attempt that will retry is not terminal failure. The default Job factory supplies database/logger, not ServiceContainer. Connect the reporter through an explicit owning Provider/Job factory adapter; do not assume a Job has `this.app`.
2. **Recovery queries:** the Queue integration owner registers `jobs.registerObserver('queue-job', inspect)` once and queries persisted execution state. Only one observer is allowed per reference type, not one per business Job. Reuse the existing integration when it already owns that observer.
3. **Reliable references:** notifications and inspection use the same `{ type, id }`, recoverable across processes. Do not use an in-process Map as the authoritative terminal state. Other execution systems use their own stable, non-conflicting reference types.

Queue Job success does not automatically mark Scheduler success. Returning `accepted` alone is incomplete. A notification can be lost or arrive before acceptance is persisted; inspection compensates for these cases. Do not assume a universal Queue completion observer is built in.

## Add a Schedule Target Type

Use this extension only when an execution system's configuration, presentation, and status protocol cannot reasonably be expressed as an ordinary Job. Resolve `scheduleTargetRegistryToken` during Provider boot and call `registry.register(target)`. The object implements the public `ScheduleTargetType<TConfig>`, where TConfig is a JSON object:

| Member                      | Implementation requirements                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type` / `title`            | Stable, unique type name / display name; do not replace `job` or `workflow`                                                                                                      |
| `validate(config: unknown)` | Synchronously validate JSON structure and return `{ valid, reason? }`; called during synchronization and execution startup                                                       |
| `describe(config)`          | Asynchronously return `{ targetLabel, description?, href?, state? }`, with state `ready/disabled/missing/invalid`; prefer an explicit state and perform no business side effects |
| `start(config, context)`    | Start execution asynchronously, follow the result union below, and deduplicate using occurrenceId                                                                                |
| `inspect(reference)`        | Optional interface, but implement for asynchronous execution to recover actual executor state                                                                                    |
| `referenceHref(reference)`  | Optional controlled detail path; encode ids and avoid unvalidated external URLs                                                                                                  |

After registration, declare `target: { type: 'your-stable-type', config: { ... } }`. The extension owner handles parameters, business permissions, credentials, and the executor. Application integration does not require changing Scheduler's private registry, tables, or dispatch Job.

## Shared Result Protocol

`dispatch()` / `start()` must return one of these four `ScheduleTargetStartResult` variants:

| Return value                                                           | Meaning                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `{ state: 'completed', outcome: 'succeeded', result?: JsonObject }`    | Business execution has succeeded; never use for merely queued work |
| `{ state: 'accepted', reference: { type, id }, receipt?: JsonObject }` | Accepted; Scheduler enters waiting until terminal completion       |
| `{ state: 'skipped', reason: string }`                                 | This execution should be skipped                                   |
| `{ state: 'failed', reason: string }`                                  | Startup or synchronous execution failed                            |

`inspect()` returns `ScheduleTargetObservation`: `{ state: 'pending' }`, `{ state: 'running' }`, `{ state: 'completed', completion }`, or `{ state: 'unknown', reason }`. Unknown is not success; a missing record is not proof of completion.

Completion has shape `{ status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out', reason?: string, result?: JsonObject, finishedAt?: Date }`. Custom targets resolve `scheduleExecutionReporterToken` and call `complete(occurrenceId, reference, completion)`; ordinary Jobs use the registry's `reportCompletion()`. Report the real terminal outcome without reversing an already completed state.

Keep receipts, results, reasons, references, and display information controlled and non-sensitive. Do not persist full business responses, inputs, or stack traces in these summaries.
