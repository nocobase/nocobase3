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

Declaration modules must not connect to a database or start a worker at module top level.

## Client-side services

The client has the same pattern. `client/service-provider.ts` holds application startup logic. In React components and custom Hooks, use `useApiClient()` to resolve the application's HTTP client and `useService(token)` to resolve other services:

```tsx
const api = useApiClient();
const realtime = useService(realtimeClientToken);
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

Jobs in `server/jobs/` are discovered automatically. Review `server/plugins.ts` and each registered plugin’s job declarations when checking contributions.

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

### Application code configuration

Each file under `server/config/` defines one section with `defineAppConfig` from `@nocobase/app-server/config`. `server/config/index.ts` imports those sections and exports `defaultAppConfigs({ auth })`. The client uses the same helpers from `@nocobase/app-client`, in their function form only.

On the server, `defineAppConfig((runtime) => options)` declares defaults alone. The object form adds rules:

```ts
const billing: AppConfigFactory<BillingConfig> = defineAppConfig({
  defaults: { currency: 'USD', trialDays: 14 }, // or (runtime) => ({ ... })
  async validate(value, ctx) {
    if (value.trialDays < 0) ctx.error('trialDays', 'must not be negative.');
  },
  public: ['currency'],
});
```

- `validate` receives the section's final value — code defaults, then `config.yml`, then environment mappings — and reports with `ctx.error(path, message, { fix })` or `ctx.warning(path, message)`, paths relative to the section. It runs at startup, on reload and in `pnpm config:check`; an error stops the start and refuses the reload. Treat the value as untrusted input. It may read local files but must not reach the network or write anything; database reachability stays with `config:check`.
- `public` lists leaf fields the browser may read. The browser reads them with `config.public.get('<section>.<field>')`, never `config.get`, which in development throws when asked for a published path. Anything not listed never reaches the browser, so secrets need no declaration; an object, function or instance cannot be listed. `config.public.get` only accepts paths declared in `PublicAppConfig`, so declare each section's public fields once on the client and a mistyped path or value type fails `pnpm typecheck`:

  ```ts
  declare module '@nocobase/app-client' {
    interface PublicAppConfig {
      billing: { currency?: string };
    }
  }
  ```

- When a plugin owns a section, use the plugin's wrapper instead, such as `defineAuthConfig` from `@nocobase/app-plugin-authentication/server` for `auth`, so its rules apply; prefer a plugin hook such as `useSignUpAvailable()` over reading published paths yourself.
- `pnpm config:check --json` reports every rule violation with code `invalid` and lists what the browser receives under `public`, so a change can be verified without opening the application.

The runtime definition declares `createAppConfig` for the loader and `defaultConfigs` for the aggregated configuration factory. `resolveAppRuntime()` assembles `runtime.config`. The entry point then calls `createApp(runtime)`, which binds `runtime.app` and uses the same configuration object. Services start afterwards.

Code configuration executes once per application. Callbacks can capture `runtime` and resolve services through `runtime.app` when invoked; do not resolve services while generating defaults. Code defaults are overridden by file configuration, then explicit environment mappings. Objects merge by field; arrays and callbacks are replaced. Reload reads environment configuration again and retains code defaults. Changing TS configuration requires a restart.

Edit `server/config/auth.ts` for authentication options, using `AuthConfig` from `@nocobase/app-plugin-authentication/server` and `username` from `better-auth/plugins`. Edit `client/config/auth.ts` for native client options, using `AuthConfig` from the `/client` entry and `usernameClient` from `better-auth/client/plugins`. Keep deployment secrets in YAML or environment variables. Better Auth instances are created once; reloading configuration does not recreate them.

Authorization integration belongs to the installed `nocobase-app-plugin-authorization` Skill; see [application permission development](authorization.md). The main plugin supplies permission sets, pages, settings, composite resources, workspace placement and database authorization. App feature development registers its composites and preserves system permission configuration. For default access, sharing or restrictions, locate the corresponding `nocobase-app-plugin-authz-default-access`, `nocobase-app-plugin-authz-sharing-rules` or `nocobase-app-plugin-authz-restriction-rules` Skill and follow its integration instructions. If that Skill is absent, treat the capability as unsupported and explain that it needs separate development; do not assume its factories, endpoints or tables exist. `authorizationToken` is the only service token; permission sets are `authz.permissionSets` on the instance it resolves.

Module defaults are assembled by `server/config/index.ts`; inspect its imports before assuming a section exists. Common sections include application, authentication, database, storage, localization, logging, queue, server, session, snowflake, and SPA settings, while a template or installed capability may add or omit sections. The client defaults are assembled independently under `client/config/`.

Factories receive `runtime` and can use `runtime.paths`, and `runtime.plugins` for application directories, routing, and resolved plugin metadata. Providers read sections with `app.config.get<ModuleConfig>('module')`. Runtime configuration reload subscriptions use `app.config.subscribe<ModuleConfig>('module', listener)`. Environment variables are declared by the section they set, in `env` of its `defineAppConfig` with paths relative to the section, such as `env: { APP_SERVER_PORT: envInteger('port') }` in `server/config/server.ts`; a plugin's wrapper declares its own, as `defineAuthConfig` does for `AUTH_SECRET`. There is no separate mapping file. `pnpm config:env` lists every variable the application reads, the path each sets and whether it is set, including those the runtime reads itself such as `APP_BASE_PATH`; a variable named in `.env.example` must be one of them. Keep deployment parameters in `config.example.yml`, behavior defaults in TS, and reserve environment overrides for secrets and startup integration.

## Persistent logging

Application templates configure `logging.loggers.request.file.name: request`, so HTTP request logs go to `storage/logs/request.<UTC-date>.<part>.log`. Other sources use the shared app file unless explicitly routed.

Use `loggingToken` from `@nocobase/app-server/logging` and `logging.getLogger(source)` for application and plugin diagnostics. Sources without a file override share `storage/logs/app.<UTC-date>.<part>.log` containing JSON Lines. `getLogger()` uses source `system`; omit `default`. Only `logging.loggers.<source>.file.name` routes a source into a separate file, without duplicating it into app. Configure `logging.file.enabled`, `name`, `retentionDays`, `maxFileSizeMB`, and `maxTotalSizeMB` independently from `logging.console.enabled` and `logging.console.pretty`. Total retention covers all files in the directory. Both development and production capture structured files; pretty only formats the terminal. Omit legacy top-level `pretty`, `default`, and `maxSizeMB` in new configuration. Host capture policy overrides App and source enablement, output and level settings. Source file overrides accept only `name` and `enabled`; they cannot change the directory or retention budget; outside that boundary explicit custom transports own their destinations.

Application composition roots call `createAppFromRuntime(runtime)` to transfer resolved configuration, paths, mode and Host logging policy and bind `runtime.app`. Preserve this when upgrading templates: Host supplies App, deployment, and runtime identities and capture policy through that boundary. Hosted runtime logs belong to the App volume, never the expanded release directory. Hub deployment logs belong to each deployment operation and are separate from application runtime logs. See the Hub plugin README for paths, retention, API limits, and the `read-log` permission.

`runtime.paths`, the configuration loader’s `context.paths`, and `app.paths` share the resolved `AppPaths` object. It exposes directory fields and `root()`, `server()`, `database()`, `client()`, `config()`, and `storage()` methods. Input `AppPathOptions` is normalized after application path policies run. Standalone declarations provide `deploymentRootDir` relative to the code root; configuration and default storage live in that deployment root, while code resources stay under `rootDir`. Server and CLI use the same declaration.

Standalone environment loading reads packaged code-root `.env` defaults, then deployment-root `.env` and `.env.local`, then the process environment and explicit overrides. Packaged defaults remain effective when deployment files are absent. Embedded scopes only use their explicitly supplied environment.
