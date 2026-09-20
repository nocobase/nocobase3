# @nocobase/queue

Application-scoped asynchronous queues built on BullMQ. A `QueueService` owns its queue resources and handlers; it is not a process-global dispatcher. Available built-in backends are `inMemory` and `redis`. Redis Cluster connections are accepted, but a known upstream pause/reconnection defect limits their lifecycle behavior; see [Cancellation, drain, and shutdown](#cancellation-drain-and-shutdown) before choosing Cluster.

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
- **redis** uses the official BullMQ `createRedisBackend` for Redis persistence and competing workers. Configure a connection explicitly, for example `{ queueBackend: 'redis', connection: { host: '127.0.0.1', port: 6379 } }`. Redis Cluster keys use a queue-specific hash tag. Do not configure ioredis `keyPrefix`.

Connection inputs and ownership follow the official BullMQ/backend contract. Configuration objects let the official backend create and own connections; supplied ioredis clients/clusters and official Redis adapters follow its shared-client path. Native node-redis callers must explicitly pass `connection: createNodeRedisClient(raw)`, importing `createNodeRedisClient` from `bullmq`; raw native clients are not transparently adapted by this service. A supplied client used by a Worker must satisfy the official Worker prerequisites: use `maxRetriesPerRequest: null` for ioredis. The service does not clear `commandTimeout`, rewrite role options, detect drivers, or create and track role-specific duplicates. BullMQ may connect and use a shared caller-owned client; shared does not mean untouched. The caller remains responsible for closing that client after all of its users have finished.

Namespace and queue name jointly determine storage identity. Services sharing a persistent backend and the same identity compete for jobs; they do not broadcast each job to every service. Inside one service, every handler registered for a queue receives a snapshot of that dispatch and executes concurrently. Registering the same function twice creates two registrations. Use the channel argument to select the business operation.

## Configuration and runtime changes

Global defaults are overlaid by `queues[queueName]`; `undefined` does not override a value. Object-valued options replace the corresponding object rather than deep-merging it. Publication options override applicable queue defaults. A queue override can select another backend or namespace.

Defaults include concurrency `1`, attempts `0`, publication delay `0`, and priority `0`. Delay, backoff delay, rate-limit duration, and lifecycle timeout fields use milliseconds; retention age uses seconds. Attempts follow BullMQ's total-attempt semantics: `attempts: 2` allows at most two processing attempts, not two retries after the first attempt. Backoff supports the validated BullMQ fixed and exponential forms.

Publication admission validates numeric safety, delay, and the maximum configured retry horizon against `2199023255551` (`2**41 - 1`). This is not an exact bound on the timestamp of an actual Redis retry transition: time spent inside a handler can move a later retry beyond that boundary, and Redis transitions remain the official backend's responsibility. The memory backend additionally checks its own transitions and rejects an out-of-range transition before mutating the active job or its lock, reporting a Worker error; this is not a terminal failed-job acknowledgement.

Retention cleanup is lazy and partitioned by terminal state: completing a job does not prune failed jobs, and failing a job does not prune completed jobs. `KeepJobs.age` is measured in seconds. `KeepJobs.limit` caps age-based cleanup work. Count limits and age limits are not a background expiration service.

Queue initialization uses official readiness. BullMQ's default queue metadata update is best-effort: successful `setup()` does not prove that this instance's metadata write succeeded. Reading `getVersion()` is not a substitute for that write guarantee. Explicit public Queue operations requested by the service, including rate-limit configuration, still await their results.

`queue.manager(name).configure()` changes supported local worker/publication settings and shared rate metadata. It cannot replace a backend, connection, or namespace. Removing a rate limit uses `rateLimit: null`. A failed remote metadata update can occur after local changes; do not assume transactional configuration rollback.

`registerBackend(name, factory)` accepts a complete BullMQ backend factory before setup freezes the registry. Custom connections are opaque to the wrapper and validated by the factory. Construction must return promptly and validate before irreversible side effects. `waitUntilReady()` and pending operations must be interruptible through backend close/disconnect; close must be idempotent and settle actual resources. Factories must implement the complete backend interface; unsupported operations must fail explicitly rather than silently succeeding. A noncooperative factory causes failed initialization/cleanup with unresolved-resource diagnostics, not a memory fallback.

## IDs, batching, and uncertain acknowledgement

A synchronous `jobIdProducer(queue, channel, message)` can supply an ID. Duplicate IDs may suppress insertion only while the existing job remains retained. IDs are not permanent business idempotency keys. Persist business idempotency separately, especially when a handler can complete an external side effect and then fail before its queue acknowledgement is recorded.

`publishMany([{ channel, message }], options)` prepares the whole batch before writing. Redis pipelines can partially commit, and an error does not mean that no jobs were inserted. Retrying can duplicate effects. Inspect business state and use durable idempotency rather than assuming rejected publication promises imply rollback.

The producer's independent `10000` ms budget covers preparation, lazy initialization, and dispatch waiting under one deadline; it does not borrow or reset the setup budget. Timeout rejects the caller's wait without cancelling an already accepted operation. The service retains pending-operation tracking and observes late success or rejection so shutdown can still report unresolved publications. Lazy initialization that finishes after a publication's deadline must not dispatch that expired publication. A producer timeout does not close or permanently poison the Queue, and the service does not automatically retry publication; subsequent availability depends on the official Queue/backend path, not a service-owned recovery mechanism.

## Cancellation, drain, and shutdown

`cancelJob(id, reason)` affects a job currently running in this service and returns false when it is not locally active. `cancelAllJobs(reason)` likewise affects local execution only. Neither method is a distributed cancellation or removal API. Cancellation signals are cooperative: business code must observe the signal. Permanent user cancellation is distinct from shutdown interruption.

`drain({ delayed: true })` removes waiting and delayed jobs, not active handlers. Unregistering a handler prevents future dispatches and waits for its current dispatches. Never await your own unregistration from inside that handler: it would wait for itself. The same restriction applies to initiating and awaiting service shutdown from work that shutdown must drain.

Shutdown is memoized. It stops new consumer work while existing producers remain available during handler drain, then closes publication admission, waits for accepted operations, and requests cleanup through public Queue/Worker lifecycle methods. Defaults are `setupTimeoutMs: 10000`, `shutdownTimeoutMs: 30000`, and `cancellationGraceMs: 5000`. The fixed producer request budget is separately `10000` ms; resource cleanup has a separate `5000` ms reserve. These are waiting and failure-reporting budgets, not physical cancellation guarantees. JavaScript cannot preempt synchronous getters, `toJSON`, ID generators, or custom factory code; expired work is rejected before subsequent dispatch once control returns. Unfinished initialization, publication, pause, processing settlement, or cleanup is reported as failed or unconfirmed, not successful cleanup. Caller-owned shared clients must still be closed by their owner.

The service uses a first `Worker.pause(false)` for local pauses, including the last handler's unregistration, and retains and observes the original pause Promise even after a bounded wait ends. Resume waits for that pause and rechecks stopped, initialization-cancelled, and handler state before admitting work; late readiness or pause settlement must not restart a stopped service. Handler completion alone does not confirm BullMQ completion, failure, or requeue settlement. Shutdown selects one close mode; it does not first call `close(false)` and then try to upgrade to `close(true)`.

**Strategy A cleanup limitation:** with official BullMQ 6.3.6, force-closing before an active handler and its draining pause finish can produce a late blocking reconnect after close. A real-Redis probe reproduced this even when handler, run, pause, and close had all fulfilled without a Worker error; the job remained active and the late connection remained observable. The force-close-versus-pending-pause ordering permanently retains a failed/unconfirmed-cleanup diagnosis for that shutdown, even after late settlement. Stopping business admission is not a no-socket guarantee or proof of successful in-process resource cleanup. Long-lived hosts requiring that stronger guarantee need a separately resolved upstream lifecycle limitation, not driver tracking or a claim that fulfilled promises prove cleanup.

**Redis Cluster known limitation:** with BullMQ 6.3.6 and ioredis 5.11.1, an ordinary `Worker.pause(false)` can remain pending during internal blocking-connection reconnection even after the handler finishes. This is not limited to forced shutdown: last-handler unregistration can remain pending, replacement consumption can wait indefinitely for that pause, and service shutdown can report a timeout or unconfirmed cleanup. Cluster connections remain accepted, but complete Cluster lifecycle acceptance is deferred; prefer non-Cluster Redis when reliable normal pause/resume is required. Keep the failing Cluster regression tests and revisit them with a verified upstream fix. The service retains strategy A without driver workarounds or third-party patches; a shutdown timeout does not cancel an outstanding unregister or prove that resources closed.

## Deployment considerations

Use Redis `maxmemory-policy noeviction` for durable queues, provision persistence appropriate to the required durability, and budget connections for queue and worker roles, blocking connections, and cluster nodes. A Redis command timeout alone does not cancel a command already accepted by the server.

Queue publication does not automatically participate in the application's business database transaction. Use an outbox or a reconciler when committing a business record and scheduling its work must survive publication failure.

## Verification and current migration scope

Run `pnpm --filter @nocobase/queue check` for unit tests, typechecks, lint, formatting, and build. Backend suites use `pnpm --filter @nocobase/queue test:integration <inMemory|redis|cluster>` with isolated infrastructure. Run one integration suite at a time.

Legacy Job, Locator, manager, and driver exports have been removed. The service validates its business options and its own memory connection contract; Redis connection interpretation and validation belong to the official backend. Do not assume every nested driver misconfiguration is rejected before resource creation. TLS verification is deferred and must not be represented as verified deployment support. The API examples above illustrate the production service contract exercised by service and plugin tests, not a guarantee that every transport failure scenario has completed acceptance.
