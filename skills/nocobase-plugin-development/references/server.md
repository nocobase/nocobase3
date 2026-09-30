# Server contributions

Use this reference when a plugin needs HTTP routes, background jobs, or a Server declaration. Read [services.md](./services.md) for reusable domain services and lifecycle ownership, and [database.md](./database.md) for database structure, initial data, and Repository APIs.

## Choose the owning module

| Requirement                                                    | Owner                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Reusable domain behavior                                       | Service, optionally registered through a `ServiceProvider`      |
| Stable cross-module capability identity                        | `ServiceToken<T>` owned and exported by the capability provider |
| HTTP input, output, authentication, and authorization          | Root or API Route contribution                                  |
| Deferred, retryable, or batch background work                  | `@nocobase/jobs` Job on the plugin's own `JobExecutor`          |
| Channel messages consumed by handlers, or delayed publication  | `QueueService` handler from `@nocobase/queue`                   |
| Table, field, relation, index, constraint, or metadata history | Migration                                                       |
| Required initial records in an existing schema                 | Seed                                                            |

Keep these boundaries visible in the code. A Route maps HTTP to a Service call. A Job validates a serializable payload and orchestrates one asynchronous execution. A Service implements reusable behavior without Hono context, status codes, paths, or job retry policy. A Provider registers dependencies and owns resource lifecycle.

## Declare the Server plugin

Compose direct contributions in `server/plugin.ts` and re-export that definition from `server/index.ts`:

```ts
import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-audit-log',
  locales,
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default plugin;
```

Declare only capabilities the plugin implements. Provider constructors and Route definitions are direct contributions. Migrations and seeds are filesystem locations relative to `baseDir`. Job classes and queue handlers are imported explicitly by their Provider; nothing discovers a directory, and the retired `queue` contribution is rejected. The target App must import the plugin's `./server` export and include the definition in its explicit `server/plugins.ts` composition; installing the package alone does not activate it.

### `baseDir` is part of the runtime contract

Every Server plugin must provide an absolute `baseDir`. In a source `server/plugin.ts`, `path.resolve(import.meta.dirname, '..')` points to the package root. In the compiled `dist/server/plugin.js`, the same expression points to `dist`. The runtime resolves migrations, seeds, and package metadata only from the loaded copy; it does not search a source fallback, a build fallback, or a directory selected from `NODE_ENV`.

Filesystem contribution paths must be safe `baseDir`-relative paths beginning with `./`; `..`, backslashes, doubled separators, and the bare `./` are rejected. The resolver walks upward from `baseDir` until it finds a `package.json` whose `name` equals `packageName`. Keep source and published `./server` exports aligned so each loads its matching declaration, and ensure compiled resources are present below `dist`.

Declaration modules must remain import-safe. Top-level code may create frozen definitions, tokens, and constructor arrays; it must not connect to a database, start a worker, create a timer, make a network request, instantiate a Provider, or execute a Route factory. App composition imports these modules before any lifecycle runs.

## Root and API routes

NocoBase Server routes are Hono routers contributed directly by a plugin:

Read [Server Route examples](./server-route-examples.md) for complete authenticated API, independently protected Root Route, public callback, authentication-and-authorization, isolated child-router, composition, and production `createRouter()` test patterns.

| Need                                             | API                  | Source path          | Mounted path         |
| ------------------------------------------------ | -------------------- | -------------------- | -------------------- |
| App business or administration API               | `defineApiRoutes()`  | `/orders`            | `/api/orders`        |
| Top-level callback, webhook, or other root entry | `defineRootRoutes()` | `/callbacks/payment` | `/callbacks/payment` |

Do not repeat `/api`, an App name, or a deployment public base path in the source path. Mount scope is not a security policy: `/api` does not authenticate a request, and a Root Route does not inherit middleware from another contribution.

### Own the security boundary

Each contribution installs and tests its own authentication and authorization. Restrict middleware to an explicit path owned by the plugin, or to an isolated child router mounted below that path. Avoid `router.use('*', ...)` on a contribution-wide router because it can affect later contributions after composition.

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);

    router.use('/audit-log/status', authentication.required());
    router.get('/audit-log/status', (context) =>
      context.json({ enabled: true }),
    );

    return router;
  });
```

This status endpoint deliberately permits every authenticated user. Authentication establishes who the caller is; authorization establishes whether that caller may perform the business action. Sensitive routes normally need both. Resolve the owner-exported authorization token, install its middleware, and require stable resource/action pairs inside handlers. Test `401` for anonymous callers, `403` for authenticated callers without the action, and success for an allowed caller.

A third-party webhook may intentionally omit NocoBase session authentication, but it still owns an explicit protocol boundary. Verify signatures or one-time state, timestamps, replay prevention, body limits, and idempotency as required by the protocol; return only necessary information. Record why the endpoint is public and test missing, invalid, valid, and duplicate deliveries.

### Organize and compose routes

Keep one or two handlers directly inside the contribution factory. When a business area has multiple handlers, shared HTTP error mapping, or a useful independent test boundary, extract `createOrderRoutes(options): Hono` and mount the returned router. Do not invent a framework-level `registerOrderRoutes(router, ...)` API that mutates a caller-owned router merely to make tests convenient.

Aggregate Root and API contributions in a stable array and give that array to `defineServerPlugin()`:

```ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes } from './api.js';
import { rootRoutes } from './root.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  rootRoutes,
  apiRoutes,
];

export default routes;
```

### Test the production contribution

Call the real contribution's `createRouter()` with an isolated `ServiceContainer`; this exercises the same dependency resolution, middleware installation, and handler factory used in production. Do not replace this with a test-only registration helper.

The [complete production contribution test](server-route-examples.md#test-the-production-contributions) creates a real `Auth` against an in-memory SQLite connection, controls its session lookup, binds the original service Tokens, and constructs a fully typed `AppPluginApplication`. It calls `createRouter()` directly and tests the mounted endpoints without partial `Auth` casts or an undefined test helper.

Also compose a later unrelated route and verify the plugin middleware does not leak into it. Contribution tests do not prove final mount prefixes, public base paths, interaction among multiple contributions, or real authentication; cover those in a target App integration test.

## Background jobs

Use a job for work that is deferred, retried, batched, or too slow for a request. Keep reusable domain behavior outside the job class. Jobs run on `@nocobase/jobs`: resolve `jobExecutorServiceToken` from `@nocobase/app-server/jobs` and take the plugin's own executor with `getJobExecutor(scope)`, using the package name as the scope. `pnpm plugin:create <name> --with server.jobs` generates this shape.

```ts
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  Job,
  type JobExecutionContext,
  type JobExecutor,
} from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

export interface RebuildIndexPayload {
  readonly collection: string;
  readonly requestedAt: string;
}

export class RebuildIndexJob extends Job<RebuildIndexPayload> {
  // The handler identity stored with every task: keep it stable.
  public static readonly jobName: string = 'rebuild-index';

  public async execute({ signal }: JobExecutionContext): Promise<void> {
    signal.throwIfAborted();
    // Validate this.payload, then call an idempotent domain operation with the signal.
  }
}

export class AuditLogJobsProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log/jobs';
  private executor: JobExecutor | undefined;

  public override async start(): Promise<void> {
    const executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getJobExecutor('@nocobase/app-plugin-audit-log');
    // Register every class before setup(): setup() starts consuming, and a
    // task waiting from an earlier run must find its handler.
    executor.registerJob(RebuildIndexJob);
    await executor.setup();
    this.executor = executor;
  }

  public override async shutdown(): Promise<void> {
    const executor = this.executor;
    this.executor = undefined;
    // Aborts running tasks and waits for them before their dependencies close.
    await executor?.shutdown();
  }
}
```

Give every job class its own stable `static jobName`; class names are refactoring details. Its constructor takes only the payload and has no side effects, and nothing injects a container, database, or logger. A job that needs an App service closes over it: the owning Provider defines the class inside a factory that captures the service and registers the class the factory returns, as `createDeliveryJob` in `packages/plugins/app-plugin-notification/server/delivery-job.ts` does. Do not reach for a module-level container.

Payloads must be strict JSON: plain objects, arrays, strings, finite numbers, booleans, and null. Do not place Services, request contexts, database connections, functions, class instances such as `Date`, or secrets in the payload. Validate it when the job runs, because a task queued by an earlier version may carry an older shape.

Submit with `executor.addJob(new RebuildIndexJob(payload))` from a Route, Provider, or Service once the owning Provider has started; a submission before setup rejects. The receipt means the backend accepted the task, not that it ran. There is no delay, priority, or deduplication option. A Route that submits a job still needs its own authentication and authorization.

Assume at-least-once execution. Use a stable business key or durable execution state for side effects such as email, external API calls, billing, and file writes. Distinguish temporary retryable failures from invalid input or terminal business failures. Log the job ID, job name, attempt, and non-sensitive business identity. Never rely on a process-local `Map` to remember completion. Shutdown aborts the signal and waits for running handlers, so honor the signal and release a job's dependencies only after `executor.shutdown()` settles.

The App's `jobs` configuration selects the backend. The built-in memory configuration keeps tasks in one process; running more than one instance needs a `redis` configuration.

Test `execute` directly for payload validation and behavior. Then start the Provider on a real memory jobs service from `createJobExecutorService(undefined, { appName, storagePath })`, submit, and await an observable result; never assume a submission runs synchronously. Cover retry and idempotency where relevant, and verify shutdown waits for a running task.

## Publish/subscribe messaging

When producers publish channel messages that application-owned handlers consume, or a message must be published after a delay, use the App's `QueueService` from `@nocobase/queue` instead of a job. Resolve `queueServiceToken` from `@nocobase/app-server/queue`; never create a second token or a private service. The App's core `QueueServiceProvider` owns setup in `start()` and shutdown after plugin Providers. Register a handler in the plugin Provider's `boot()` with `queue.consumer(queueName).consume(handler)`, keep the unregister function it returns, and await it in `shutdown()` before releasing handler dependencies.

Publish with `queue.producer(queueName).publish(channel, payload)` after startup; the receipt identifies queued work, not a completed result. Keep queue and channel names stable and filter channels explicitly in the handler, which receives the channel, the message, and an `AbortSignal`. The same payload, idempotency, and authorization rules as jobs apply. `packages/app/app-skills/skills/nocobase-app-development/references/services-and-jobs.md` describes backends, identity, and shutdown in detail.

## Verification and source references

Run the modified plugin's `lint`, `typecheck`, `test`, and `build`, plus the affected target App checks. Use `pnpm nocobase plugin inspect <name> --workspace-root . --app <app> --json` only when registration is in question; it reads static registration facts and does not prove Route security, Provider lifecycle, Job execution, migrations, or seeds.

Use these maintained implementations when a detail is uncertain:

- App Server plugin contract (`packages/app/app-server/src/plugins/types.ts`)
- Server plugin path resolution (`packages/app/app-server/src/plugins/resolve.ts`)
- Application startup and Route mounting (`packages/app/app-server/src/application/index.ts`)
- Runnable Route plugin (`packages/examples/app-plugin-routes-example`)
- Runnable jobs plugin (`packages/examples/app-plugin-jobs-example`)
- Runnable Queue plugin (`packages/examples/app-plugin-queue-example`)
