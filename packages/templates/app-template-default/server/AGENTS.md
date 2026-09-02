# Server Instructions

This directory is the application's API server. Read the application's root `AGENTS.md` first; `skills/nocobase-app-development/references/` holds the detail behind it.

Add domain APIs here, in this application. Do not create a plugin package for a feature this application owns — plugins are for capabilities shared across several applications, and only when the user explicitly asks for one.

## What lives where

- `routes/` holds your HTTP endpoints and the array `routes/index.ts` exports.
- `providers/` holds your services, their tokens, and their lifecycle.
- `config/` composes application configuration: defaults, environment mapping, and package-owned config sections.
- `runtime.ts` is the composition root, declaring config, plugins, service providers, and routes.
- `app.ts` assembles the application and its core providers and middleware.
- `standalone.ts` is the Node entry point; `embedded.ts` is the entry point when a host process mounts this application. Both resolve the same runtime.
- `plugins.ts` lists the plugins the server loads. Let `pnpm plugin:register` and `pnpm plugin:unregister` edit it.
- `jobs/` holds background jobs, discovered automatically.

## Rules

- **Every route owns its own authentication and authorization.** Mounting under `/api` authenticates nothing. Install `auth.required()` on the paths you own, and add an explicit `resource`/`action` check when permission is needed. Never depend on middleware from another route or on registration order.
- Scope middleware to paths you own or to an isolated sub-router mounted at your prefix. A `router.use('*', ...)` on the top-level router leaks into contributions mounted later.
- A deliberately public webhook still verifies a signature, timestamp, or one-time state. Record why it is public and test that invalid requests are rejected.
- Route paths are application-local. Do not repeat `/api`, and never write the deployment base path such as `/main` — the mount adapter strips and restores it.
- Keep HTTP in the route and domain logic in a service. A service does not read a Hono context, return status codes, or decide retry behavior.
- Bind services to tokens in a provider's `register()`. Import a token from where it is defined; two `createServiceToken` calls with the same name are two different keys.
- Declaration modules are imported by `server:inspect`. Nothing at module top level may connect to a database, start a worker, or execute a route factory. Long-lived resources belong in `start()` and are released in `shutdown()`.
- Read configuration through the typed config, not `process.env`, inside providers and routes.
- Schema changes are migrations in `../database/migrations/`, spelled out explicitly and never importing an evolving definition.

Before finishing, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. `pnpm server:config` prints resolved paths, database, and provider configuration; `pnpm server:inspect --json` prints the composition snapshot. Both report wiring, not correctness — cover behavior with tests.
