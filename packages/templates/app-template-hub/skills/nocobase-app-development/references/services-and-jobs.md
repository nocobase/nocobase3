# Services and background jobs

A service holds reusable domain logic. A job runs work outside the request that triggered it.

## Services

Put domain logic in a service under `server/providers/` once more than one route needs it, or once it is worth testing on its own. A route that only reads and returns a list may query directly.

A service is registered by a provider under a token, so anything in the application can resolve it without importing the implementation:

```ts
// server/providers/orders.ts
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface OrderService {
  list(): Promise<Order[]>;
  create(input: CreateOrderInput): Promise<Order>;
}

export const orderServiceToken: ServiceToken<OrderService> =
  createServiceToken<OrderService>('app/order-service');

export default class OrderProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/order-provider';

  public override register(): void {
    this.app.container.singleton(orderServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createOrderService(database);
    });
  }
}
```

Add the provider to the array in `server/providers/index.ts` and export its token from there so routes can import it.

Resolve it where you need it:

```ts
const orders = app.container.resolve(orderServiceToken);
```

**The token is the identity.** Two `createServiceToken` calls with the same name are two different keys — the container matches by object identity. Always import the token from where it is defined rather than recreating one.

`singleton` builds the service once, on first resolve. Use `instance` for an already-constructed value.

Keep the layers apart: a service should not read a Hono context, return HTTP status codes, or decide retry behavior. It takes its dependencies and returns domain results.

## Provider lifecycle

| Method       | Runs                             | For                                                          |
| ------------ | -------------------------------- | ------------------------------------------------------------ |
| `register()` | Assembly, before anything starts | Binding tokens. Do not connect or start anything             |
| `boot()`     | After all providers registered   | Resolve dependencies and register queue handlers without I/O |
| `start()`    | Application start                | Long-lived resources: listeners, pollers                     |
| `shutdown()` | Application stop, reverse order  | Await handler unregistration before releasing dependencies   |

Declaration modules are imported by `server:inspect`, so nothing at module top level may connect to a database or start a worker.

## Client-side services

The client has the same pattern. `client/service-provider.ts` holds application startup logic, and services are resolved with `useService`:

```tsx
const api = useService(apiClientToken);
const realtime = useService(realtimeClientToken);
```

## Background jobs

Work that should not block a response — sending mail, calling a slow third party, batch processing — uses the App's `QueueService`. Import `queueServiceToken` from `@nocobase/app-server/queue`; never recreate the token or put a service, dispatcher, or handler registry in module-global state. Each App owns its service. `server/jobs/` is an optional home for explicitly imported handlers, not an auto-discovery directory. The retired plugin contribution `queue.jobs` is rejected; do not declare it.

The core `QueueServiceProvider` binds a lazy singleton created with `createQueueService()` from `@nocobase/queue`. Register custom backend factories before setup begins. Construction, provider registration, and handler registration during `boot()` do not connect or consume. The App owns `setup()` through the core provider's `start()`, and owns `shutdown()` after application and plugin providers have unsubscribed. A consumer provider must not create or close a shared Worker or call the shared service's lifecycle methods.

### Register a handler through a provider

This example assumes an application-owned `searchServiceToken` exported from `server/providers/search.ts`, whose service implements `rebuildIndex(collection: string, signal: AbortSignal): Promise<void>`. Register that service's provider before this consumer so reverse shutdown keeps it alive until unregistration completes.

```ts
// server/providers/rebuild-index.ts
import type { Application } from '@nocobase/app-server/application';
import { queueServiceToken } from '@nocobase/app-server/queue';
import type { UnregisterHandler } from '@nocobase/queue';
import { ServiceProvider } from '@nocobase/service-provider';
import { searchServiceToken } from './search.js';

export default class RebuildIndexProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/rebuild-index-provider';
  private unregister: UnregisterHandler | undefined;

  public override async boot(): Promise<void> {
    const queue = this.app.container.resolve(queueServiceToken);
    const search = this.app.container.resolve(searchServiceToken);

    this.unregister = queue
      .consumer('app/search')
      .consume(async (channel, payload, signal): Promise<void> => {
        if (channel !== 'rebuild-index') return;
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('collection' in payload) ||
          typeof payload.collection !== 'string'
        ) {
          throw new Error('Invalid rebuild-index payload');
        }
        signal.throwIfAborted();
        await search.rebuildIndex(payload.collection, signal);
      });
  }

  public override async shutdown(): Promise<void> {
    await this.unregister?.();
    this.unregister = undefined;
  }
}
```

Add this provider to `server/providers/index.ts`. For a published plugin, contribute the provider through `serviceProviders` instead. Resolve database, logging, i18n, and other domain dependencies from their original tokens in the provider and capture them in the handler closure; there is no Job factory injecting a container or dependencies. Keep constructors and dependency resolution free of startup I/O. If the domain service needs asynchronous readiness, establish it before consumption can begin, rather than assuming a later plugin `start()` runs before the core queue provider starts.

`consume(handler)` returns an async unregister function immediately; it does not return a Worker. Await that function in `shutdown()` before releasing handler dependencies. Unregistration excludes the registration from new execution snapshots and waits for its existing invocations; it does not cancel them. Never await a handler's own unregister function from inside that handler, or await shared service shutdown from a handler: either can wait on itself. The last unregister pauses only this service's local consumer, not other instances.

### Publish and observe completion

After the App has started, a route or service resolves the same token and publishes to an explicit logical queue and channel:

```ts
import { queueServiceToken } from '@nocobase/app-server/queue';

const queue = app.container.resolve(queueServiceToken);
const receipt = await queue
  .producer('app/search')
  .publish('rebuild-index', { collection: 'orders' }, { delay: 1_000 });
// receipt.jobId identifies the queued work, not a completed domain result.
```

`delay` is a non-negative number of milliseconds, not a duration object. Publishing returns a `{ jobId }` receipt, not the handler's result. Even the default `inMemory` backend runs asynchronously; wait for a persisted result or another explicit completion signal in tests and user-facing flows. A publish timeout or lost response does not prove that nothing was written. HTTP producers still enforce their own authentication and authorization.

### Payload, identity, and backend selection

Publish JSON-serializable data, preferably business IDs, and validate it in the handler. Do not publish service instances, database connections, request contexts, functions, or secrets. Circular references and BigInt fail serialization. Resolve records through the captured domain service when the handler runs, and account for older payload versions still in a durable queue.

The logical queue name and namespace determine queue identity; the channel selects work within that queue, not a separate consumer subscription. Keep both queue and channel names stable. All handlers in a local execution snapshot run, so filter channels explicitly; an unmatched handler returns successfully. If all handlers skip, the job completes. Shared persistent queues distribute jobs between instances rather than broadcasting every job to every App. Use different logical queues for independent delivery requirements.

Configure `QueueOptions` in `server/config/queue.ts` and deployment overrides in `config.yml`. The default backend is private `inMemory`, with the App name as the default namespace; it neither connects to localhost Redis nor persists work across restart. Select `redis` or `postgres` and their connection settings explicitly for persistence. A configured backend failure is an error, not a reason to fall back to memory. Persistent deployments sharing a backend target, namespace, and queue intentionally compete; give unrelated Apps distinct namespaces. In-memory services remain isolated even with identical names.

### Retries, shutdown, and idempotency

A job may run more than once after a retry or duplicate delivery. If one handler fails, a retry reruns the whole handler snapshot selected for that attempt, not only the failed operation. Configure `attempts` and fixed or exponential `backoff` deliberately; attempts includes the initial execution, and backoff delays use milliseconds. Retention age uses seconds. Use persisted business keys or execution state to make external side effects harmless on repetition. A custom `jobIdProducer` only deduplicates while the job is retained; it is not permanent business idempotency.

Normal service shutdown stops claiming work and waits for handlers, retaining producer access during that wait. It does not promise to drain waiting or delayed work. Handlers should cooperate with their `AbortSignal`; a shutdown timeout followed by an exhausted cancellation grace period is a failure, not proof that application code stopped. Plugin shutdown must await unregistration before releasing dependencies, and the App shuts down its QueueService afterwards. Queue publication is not automatically part of a business database transaction; use an explicit outbox or reconciliation strategy when the two must stay consistent.

## Work that runs on a schedule

A job runs when something dispatches it. Work that has to happen _because time passed_ — scan for records overdue today, send a nightly digest, expire stale sessions — needs a scheduler, and `@nocobase/cron` provides one.

There is no container token for it: create a manager in a provider, and tie its lifecycle to the provider's.

```ts
import { createCronJobManager, type CronJobManager } from '@nocobase/cron';

export default class OverdueScanProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/overdue-scan-provider';

  private readonly cron: CronJobManager = createCronJobManager();

  public override async start(): Promise<void> {
    this.cron.addJob({
      cronTime: '0 8 * * *',
      onTick: async () => {
        // Keep this thin: resolve the service and call it.
      },
    });
    this.cron.start();
  }

  public override async shutdown(): Promise<void> {
    this.cron.close();
  }
}
```

`start()` and `shutdown()` are the right hooks — a manager created in `register()` would outlive nothing and never be released. `addJob` accepts the options of the `cron` package, including `timeZone`, which matters as soon as "8am" means a particular office's morning.

Keep the tick thin. It should resolve a service and call one method, so the behavior stays testable without waiting for a schedule; test that method directly and let the schedule only decide when it runs.

Two things to decide before shipping one:

- **More than one instance.** Every replica runs its own scheduler, so a nightly digest scheduled in three replicas sends three digests. Guard with a lock, a claim on the row being processed, or by dispatching to a queue whose deduplication you control.
- **Long or heavy work.** A tick that runs for minutes holds the process. Prefer a tick that dispatches a job and returns, which also gets you the queue's retry behavior.

## Verify

- The service resolves from the token and behaves correctly in isolation.
- Provider lifecycle releases in `shutdown()` what `start()` acquired.
- A handler registered in `boot()` does not run before App start; publication returns a receipt and the test separately waits for observable completion.
- The handler validates a realistic payload, filters channels, and running it twice is harmless.
- Shutdown awaits unregistration before releasing domain dependencies; two Apps do not share handler state.
- A failure retries or terminates as intended.
- A scheduled tick's work is tested directly, and running it on more than one instance does not duplicate its effect.

### Application code configuration

Each file under `server/config/` defines one section with `defineAppConfig((runtime) => options)` from `@nocobase/app-server/config`. `server/config/index.ts` imports those sections and exports `defaultAppConfigs({ auth })`. The client uses the same helpers from `@nocobase/app-client`.

The runtime definition declares `config` for the static loader and `defaultConfig` for the aggregated configuration factory. `resolveAppRuntime()` assembles `runtime.config`. The entry point then calls `createApp(runtime)`, which binds `runtime.app` and uses the same configuration object. Services start afterwards.

Code configuration executes once per application. Callbacks can capture `runtime` and resolve services through `runtime.app` when invoked; do not resolve services while generating defaults. Code defaults are overridden by file configuration, then explicit environment mappings. Objects merge by field; arrays and callbacks are replaced. Reload reads environment configuration again and retains code defaults. Changing TS configuration requires a restart.

Edit `server/config/auth.ts` for authentication options, using `AuthConfig` from `@nocobase/app-plugin-authentication/server` and `username` from `better-auth/plugins`. Edit `client/config/auth.ts` for native client options, using `AuthConfig` from the `/client` entry and `usernameClient` from `better-auth/client/plugins`. Keep deployment secrets in YAML or environment variables. Better Auth instances are created once; reloading configuration does not recreate them.

Module defaults are editable in `server/config/app.ts`, `database.ts`, `caching.ts`, `drive.ts`, `queue.ts`, `session.ts`, `logging.ts`, `i18n.ts`, `snowflake.ts`, `server.ts`, `spa.ts`, `ai.ts`, `notification.ts`, and `workflow.ts`. Hub also has `hub.ts`. The client has `app.ts`, `api.ts`, and `auth.ts`.

Factories receive `runtime` and can use `runtime.configPaths`, `runtime.paths`, and `runtime.plugins` for application directories, routing, and resolved plugin metadata. Providers read sections with `app.config.get<ModuleConfig>('module')`. Runtime configuration reload subscriptions use `app.config.subscribe<ModuleConfig>('module', listener)`. Environment mappings live in `server/environment.ts`; each variable has one explicit target. Keep deployment parameters in `config.example.yml`, behavior defaults in TS, and reserve environment overrides for secrets and startup integration.
