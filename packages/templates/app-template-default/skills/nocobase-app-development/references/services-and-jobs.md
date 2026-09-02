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

| Method       | Runs                             | For                                              |
| ------------ | -------------------------------- | ------------------------------------------------ |
| `register()` | Assembly, before anything starts | Binding tokens. Do not connect or start anything |
| `boot()`     | After all providers registered   | Work needing other services                      |
| `start()`    | Application start                | Long-lived resources: listeners, pollers         |
| `shutdown()` | Application stop                 | Releasing what `start()` acquired                |

Declaration modules are imported by `server:inspect`, so nothing at module top level may connect to a database or start a worker.

## Client-side services

The client has the same pattern. `client/service-provider.ts` holds application startup logic, and services are resolved with `useService`:

```tsx
const appClient = useService(appApiClientToken);
```

## Background jobs

Work that should not block a response — sending mail, calling a slow third party, batch processing — belongs in a job under `server/jobs/`:

```ts
// server/jobs/rebuild-index.ts
import { Job, type JobOptions } from '@nocobase/queue';

export interface RebuildIndexPayload {
  readonly collection: string;
  readonly requestedAt: string;
}

export default class RebuildIndexJob extends Job<RebuildIndexPayload> {
  public static options: JobOptions = {
    name: 'app/rebuild-index',
    queue: 'default',
  };

  public async execute(): Promise<void> {
    // Validate the payload, then call a reusable domain operation.
  }
}
```

Jobs in `server/jobs/` are discovered automatically; `pnpm server:config` prints the resolved locations.

Dispatch by resolving the queue manager:

```ts
const queue = app.container.resolve(queueManagerToken);

await queue.dispatch(RebuildIndexJob, {
  collection: 'orders',
  requestedAt: new Date().toISOString(),
});
```

### What a payload may contain

Only serializable data. A worker may run in another process and rebuilds the payload from storage, so a service instance, a database connection, a request context, a function, or a secret cannot survive the trip. Pass an ID and resolve the object inside `execute()`.

`options.name` is the stable identity of queued work. Do not rely on the class name — a rename would orphan everything already queued.

### Retries and idempotency

A job may run more than once: a retry after a transient failure, or a duplicate delivery. Anything with an external side effect — mail, payment, a file write — needs a stable business key or persisted execution state so a second run is harmless.

Distinguish a transient failure worth retrying from a bad-input failure that never will be. Do not keep completion state in a module-level variable; another process will not see it.

By default the job factory supplies `database` and `logger`, not the service container. Do not assume `container.resolve()` inside a job. Extract shared logic into a function taking explicit dependencies, and construct it from what the job has.

The default queue connection is `sync`, which runs jobs inline — convenient in development, and the reason a job that appears to work locally may behave differently against a real queue.

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
- The job runs with a realistic payload, and running it twice is harmless.
- A failure retries or terminates as intended.
- A scheduled tick's work is tested directly, and running it on more than one instance does not duplicate its effect.
