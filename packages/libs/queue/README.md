# @nocobase/queue

Application-scoped asynchronous queues built on BullMQ. A `QueueService` owns its queue resources and handlers; it is not a process-global dispatcher. Available built-in backends are `inMemory` and `redis` (including Redis Cluster).

## Standalone service

```ts
import { createQueueService } from '@nocobase/queue';

const queue = createQueueService({ namespace: 'example' });
let acknowledge: () => void = () => {};
const delivered = new Promise<void>((resolve) => {
  acknowledge = resolve;
});
const unregister = queue
  .consumer('email')
  .consume<{ recipient: string }>(async (channel, message, signal) => {
    if (channel !== 'welcome') return;
    signal.throwIfAborted();
    await sendWelcomeEmail(message.recipient);
    acknowledge();
  });

await queue.setup();
const receipt = await queue.producer('email').publish('welcome', {
  recipient: 'reader@example.com',
});
console.log(receipt.jobId); // Publication acknowledgement, not handler completion.

await delivered; // Demo-only completion signal for this local handler.
await unregister();
await queue.shutdown();
```

`sendWelcomeEmail` represents application-owned business code. Handlers receive decoded JSON data and an `AbortSignal`. Payloads must be JSON-compatible; there is no fallback to class instances, functions, or arbitrary object serialization.

## Application lifecycle

NocoBase applications assemble `QueueServiceProvider` from `@nocobase/app-server/queue` and resolve the shared `queueServiceToken`. Registration is lazy; the provider calls `setup()` during start and `shutdown()` during application shutdown. Its namespace defaults to the application name. Plugins register handlers during boot and await the returned unregistration functions before releasing business dependencies. Plugins do not create or close their own shared workers.

Pass application-owned environment context through `app.addServiceProvider(QueueServiceProvider, { nodeEnv: runtime.env.NODE_ENV })`, not through queue configuration. The provider logs `Queue is running in memory mode. Jobs will be lost on restart.` when a memory queue is actually initialized unless `nodeEnv` is `develop` or `development`. Standalone library users can supply logging and an `onInMemoryQueueInitialized` callback through service dependencies. The library does not read application or process-global environment state.

Legacy plugin `queue.jobs` declarations are rejected. Register explicit provider-owned handlers instead of scanning Job modules.

## Backends and isolation

- **inMemory** is the default. Each service owns independent state, even when two services use the same namespace. It needs no connection and loses all jobs when the service is destroyed or the process exits.
- **redis** uses Redis persistence and competing workers. Configure a connection explicitly, for example `{ queueBackend: 'redis', connection: { host: '127.0.0.1', port: 6379 } }`. Borrowed ioredis clients/clusters, native node-redis clients, and official BullMQ Redis adapters use owned duplicates; the original remains caller-owned. Ordinary driver settings are preserved, while producer request bounds and Worker retry policy are service-owned. Redis Cluster keys use a queue-specific hash tag. Do not configure ioredis `keyPrefix`.

Namespace and queue name jointly determine storage identity. Services sharing a persistent backend and the same identity compete for jobs; they do not broadcast each job to every service. Inside one service, every handler registered for a queue receives a snapshot of that dispatch and executes concurrently. Registering the same function twice creates two registrations. Use the channel argument to select the business operation.

## Configuration and runtime changes

Global defaults are overlaid by `queues[queueName]`; `undefined` does not override a value. Object-valued options replace the corresponding object rather than deep-merging it. Publication options override applicable queue defaults. A queue override can select another backend or namespace.

Defaults include concurrency `1`, attempts `0`, publication delay `0`, and priority `0`. Delay, backoff delay, rate-limit duration, and lifecycle timeout fields use milliseconds; retention age uses seconds. Attempts follow BullMQ's total-attempt semantics: `attempts: 2` allows at most two processing attempts, not two retries after the first attempt. Backoff supports the validated BullMQ fixed and exponential forms.

Scheduling timestamps must not exceed `2199023255551` (`2**41 - 1`); publication validation checks delay and the maximum configured retry horizon. Time spent inside a handler can still make a later retry exceed that boundary. The memory backend rejects that transition before mutating the active job or its lock and reports a Worker error; this is not a terminal failed-job acknowledgement.

Retention cleanup is lazy and partitioned by terminal state: completing a job does not prune failed jobs, and failing a job does not prune completed jobs. `KeepJobs.age` is measured in seconds. `KeepJobs.limit` caps age-based cleanup work. Count limits and age limits are not a background expiration service.

`queue.manager(name).configure()` changes supported local worker/publication settings and shared rate metadata. It cannot replace a backend, connection, or namespace. Removing a rate limit uses `rateLimit: null`. A failed remote metadata update can occur after local changes; do not assume transactional configuration rollback.

`registerBackend(name, factory)` accepts a complete BullMQ backend factory before setup freezes the registry. Custom connections are opaque to the wrapper and validated by the factory. Construction must return promptly and validate before irreversible side effects. `waitUntilReady()` and pending operations must be interruptible through backend close/disconnect; close must be idempotent and settle actual resources. Factories must implement the complete backend interface; unsupported operations must fail explicitly rather than silently succeeding. A noncooperative factory causes failed initialization/cleanup with unresolved-resource diagnostics, not a memory fallback.

## IDs, batching, and uncertain acknowledgement

A synchronous `jobIdProducer(queue, channel, message)` can supply an ID. Duplicate IDs may suppress insertion only while the existing job remains retained. IDs are not permanent business idempotency keys. Persist business idempotency separately, especially when a handler can complete an external side effect and then fail before its queue acknowledgement is recorded.

`publishMany([{ channel, message }], options)` prepares the whole batch before writing. Redis pipelines can partially commit, and an error does not mean that no jobs were inserted. Retrying can duplicate effects. Inspect business state and use durable idempotency rather than assuming rejected publication promises imply rollback.

## Cancellation, drain, and shutdown

`cancelJob(id, reason)` affects a job currently running in this service and returns false when it is not locally active. `cancelAllJobs(reason)` likewise affects local execution only. Neither method is a distributed cancellation or removal API. Cancellation signals are cooperative: business code must observe the signal. Permanent user cancellation is distinct from shutdown interruption.

`drain({ delayed: true })` removes waiting and delayed jobs, not active handlers. Unregistering a handler prevents future dispatches and waits for its current dispatches. Never await your own unregistration from inside that handler: it would wait for itself. The same restriction applies to initiating and awaiting service shutdown from work that shutdown must drain.

Shutdown is memoized. It stops new consumer work while existing producers remain available during handler drain, then closes publication admission, settles accepted operations, and closes owned resources. Defaults are `setupTimeoutMs: 10000`, `shutdownTimeoutMs: 30000`, and `cancellationGraceMs: 5000`. The fixed producer request budget is separately `10000` ms, including preparation and lazy initialization; resource cleanup has a separate `5000` ms reserve. JavaScript cannot preempt synchronous getters, `toJSON`, ID generators, or custom factory code; expired work is rejected before subsequent dispatch once control returns. A timeout or close rejection is not proof that every underlying operation has stopped. Preserve cleanup diagnostics and do not immediately reuse an invalidated generation. Borrowed originals remain owned by the caller.

## Deployment considerations

Use Redis `maxmemory-policy noeviction` for durable queues, provision persistence appropriate to the required durability, and budget connections for queue and worker roles, blocking connections, and cluster nodes. A Redis command timeout alone does not cancel a command already accepted by the server.

Queue publication does not automatically participate in the application's business database transaction. Use an outbox or a reconciler when committing a business record and scheduling its work must survive publication failure.

## Verification and current migration scope

Run `pnpm --filter @nocobase/queue check` for unit tests, typechecks, lint, formatting, and build. Backend suites use `pnpm --filter @nocobase/queue test:integration <inMemory|redis|cluster>` with isolated infrastructure. Run one integration suite at a time.

Legacy Job, Locator, manager, and driver exports have been removed. Connection option support is deliberately validated rather than accepting arbitrary driver fields. TLS verification is deferred and must not be represented as verified deployment support. The API examples above illustrate the production service contract exercised by service and plugin tests, not a guarantee that every transport failure scenario has completed acceptance.
