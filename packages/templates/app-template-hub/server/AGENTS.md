# Server Instructions

This directory is the application's API server. Read the application's root `AGENTS.md` first; `skills/nocobase-app-development/references/` holds the detail behind it.

Add domain APIs here, in this application. Do not create a plugin package for a feature this application owns — plugins are for capabilities shared across several applications, and only when the user explicitly asks for one.

## What lives where

- `routes/` holds your HTTP endpoints and the array `routes/index.ts` exports.
- `providers/` holds your services, their tokens, and their lifecycle.
- `config/` defines editable module defaults with `defineAppConfig`; `config/index.ts` collects them with `defaultAppConfigs`. `config.ts` loads deployment settings and `environment.ts` maps environment variables.
- `runtime.ts` is the composition root, declaring config, plugins, service providers, and routes.
- `app.ts` assembles the application and its core providers and middleware.
- `standalone.ts` is the Node entry point; `embedded.ts` is the entry point when a host process mounts this application. Both resolve the same runtime.
- `plugins.ts` lists the plugins the server loads. Let `pnpm plugin:register` and `pnpm plugin:unregister` edit it.
- `jobs/` may hold queue handlers explicitly imported by a provider; it is not auto-discovered. Register consumers through `serviceProviders`, never the retired `queue.jobs` contribution, which is rejected.

## Rules

- **Every route owns its own authentication and authorization.** Mounting under `/api` authenticates nothing. Install `auth.required()` on the paths you own, and add an explicit `resource`/`action` check when permission is needed. Never depend on middleware from another route or on registration order.
- Scope middleware to paths you own or to an isolated sub-router mounted at your prefix. A `router.use('*', ...)` on the top-level router leaks into contributions mounted later.
- A deliberately public webhook still verifies a signature, timestamp, or one-time state. Record why it is public and test that invalid requests are rejected.
- Route paths are application-local. Do not repeat `/api`, and never write the deployment base path such as `/main` — the mount adapter strips and restores it.
- Keep HTTP in the route and domain logic in a service. A service does not read a Hono context, return status codes, or decide retry behavior.
- Bind services to tokens in a provider's `register()`. Import a token from where it is defined; two `createServiceToken` calls with the same name are two different keys.
- Declaration modules are imported by `server:inspect`. Nothing at module top level may connect to a database, start a worker, or execute a route factory. Long-lived resources belong in `start()` and are released in `shutdown()`.
- Resolve the original `queueServiceToken` from `@nocobase/app-server/queue`. In `boot()`, register with `queue.consumer(name).consume(handler)` without I/O and retain its async unregister function. Await it in `shutdown()` before releasing handler dependencies; never await it from inside its own handler.
- The App's core `QueueServiceProvider` owns `createQueueService()`, `setup()` in `start()`, and final shutdown after consumer providers. Do not create or stop shared Workers in application or plugin providers. Make domain dependencies ready before consumption begins.
- Publish with `queue.producer(name).publish(channel, payload, { delay: 1_000 })`; delay is numeric milliseconds and the receipt is not completion. Default `inMemory` is asynchronous, App-private, and loses jobs on restart; persistence requires explicit backend configuration. Read the services-and-jobs reference for identity, retries, and shutdown boundaries.
- Pass `{ nodeEnv: runtime.env.NODE_ENV }` to `QueueServiceProvider` in `app.ts`, not through queue configuration. Memory initialization warnings are suppressed only for `develop` and `development`; the provider never reads the process environment.
- Read configuration through the typed config, not `process.env`, inside providers and routes.
- Schema changes are migrations in `../database/main/migrations/`, spelled out explicitly and never importing an evolving definition.

Before finishing, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. `pnpm server:inspect --json` prints the composition snapshot. It reports wiring, not correctness — cover behavior with tests.
