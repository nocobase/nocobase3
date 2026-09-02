# NocoBase 3 Application

A full-stack NocoBase 3 application. The server runs on `@nocobase/app-server` and the browser client is React with Refine, shadcn/ui, and Tailwind CSS.

You own everything in this directory. Add pages, API routes, database tables, and business logic directly here — this is your application's source code, not a framework you extend from the outside.

## Getting started

Start the development server:

```bash
pnpm dev
```

`pnpm dev` starts the API server and the Vite client together, picks free ports if the defaults are taken, and prints the URL to open. Use the printed URL rather than assuming a port.

### Review your configuration

`config.yml` was written when the project was created, carrying the database you chose and a generated `auth.secret`. It gets you running; adjust it for your situation:

- **Database.** Point the connection at the database you actually intend to use — dialect, host, port, and credentials.
- **Where the application is served.** `APP_BASE_PATH` is the public mount path, `/main` by default, so the development URL looks like `http://127.0.0.1:13000/main/`. `APP_SERVER_PORT` and `APP_SERVER_HOST` change what the server binds to.
- **Anything a feature you enable requires** — mail delivery, IM webhooks, storage. `config.example.yml` documents every available option, including sections your `config.yml` does not yet have.

`config.yml` is gitignored because it holds your `auth.secret`. Deploy it through your secret management rather than committing it, and run `pnpm server:config` to see what the application resolved.

To run against a production build instead:

```bash
pnpm build
pnpm start
```

## Project structure

```text
client/                  Browser application
├── routes.ts            Your page routes
├── pages/               Your page components
├── components/          Your components
│   └── ui/              shadcn/ui primitives
├── layouts/             Settings and dev tool shells
├── shell/               Authenticated app shell: header, sidebar, user menu
├── routing/             Route rendering, access checks, loading and error UI
├── locales/             Your translated strings
├── theme/               App-wide theme and light/dark selector
├── extensions/          Application-owned copies of plugin-published UI
├── plugins.ts           Which plugins the browser loads
├── react-providers.ts   Your React context providers
├── service-provider.ts  Your client startup logic
└── runtime.ts           Composition root tying the above together

server/                  API server
├── routes/              Your HTTP endpoints
├── providers/           Your services and their lifecycle
├── config/              Application configuration composition
├── plugins.ts           Which plugins the server loads
├── app.ts               Application assembly
├── runtime.ts           Composition root
├── standalone.ts        Node entry point
└── embedded.ts          Entry point when a host process mounts it

database/
├── migrations/          Your schema history
└── seeds/               Your required initial data

tests/                   Unit and integration tests
e2e/                     Browser tests needing a real server
config.yml               Your configuration, generated at setup; gitignored
config.example.yml       Documented configuration template
skills/                  In-depth development guides for AI agents
```

The three files named `runtime.ts`, `plugins.ts`, and `routes.ts` are composition roots: they list what the application is made of. Reading them tells you what is loaded and in what order.

## Scripts

### Everyday development

| Script       | What it does                                      |
| ------------ | ------------------------------------------------- |
| `pnpm dev`   | Start the API server and client with hot reload   |
| `pnpm build` | Build the client and server into `dist/`          |
| `pnpm start` | Run the built server; requires `pnpm build` first |

### Database

| Script         | What it does                                                                               |
| -------------- | ------------------------------------------------------------------------------------------ |
| `pnpm migrate` | Apply pending migrations from your `database/migrations/` and from every registered plugin |
| `pnpm seed`    | Run seeds from `database/seeds/` and from registered plugins                               |

Migrations also run automatically on startup while `database.migrations.autoRun` is `true` in `config.yml`. Run `pnpm migrate` explicitly when you want to apply a schema change without restarting.

### Checks

| Script               | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `pnpm test`          | Run the test suite once                                      |
| `pnpm test:watch`    | Re-run tests as files change                                 |
| `pnpm test:coverage` | Run tests and write a coverage report                        |
| `pnpm typecheck`     | Typecheck the client, tooling, and server                    |
| `pnpm lint`          | Report lint problems                                         |
| `pnpm fix`           | Fix lint problems, then format                               |
| `pnpm check`         | Everything above plus a build; what to run before committing |

### Plugins

Plugins add features to your application. Let these commands edit `package.json`, `client/plugins.ts`, and `server/plugins.ts` for you rather than editing those files by hand.

| Script                          | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| `pnpm plugin:register <name>`   | Install a plugin and wire it into the client and server   |
| `pnpm plugin:unregister <name>` | Remove a plugin and its wiring                            |
| `pnpm plugin:update`            | Upgrade registered plugins and re-sync their agent skills |
| `pnpm plugin:inspect <name>`    | Report a plugin's registration state; read-only           |
| `pnpm plugin:skills:sync`       | Re-copy plugin agent skills into `.agents/skills/`        |

Ordering in `client/plugins.ts` and `server/plugins.ts` is contribution order, and a plugin is enabled by appearing in the array. Reorder entries or pass a plugin its options by hand; leave adding and removing entries to the commands.

### Diagnostics

| Script                | What it does                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| `pnpm server:config`  | Print resolved configuration: paths, database, queue, providers. Secrets are redacted |
| `pnpm client:inspect` | Print the resolved client composition: routes, providers, and which file owns each    |
| `pnpm server:inspect` | Print the resolved server composition                                                 |

These read static declarations. They report what is wired, not whether it works — a passing inspection is not a substitute for tests.

## Configuration

`config.yml` is the single source of configuration, written for you at generation time and yours to edit from there. It is gitignored because it carries your `auth.secret`; deploy it through your secret management rather than committing it. `config.example.yml` documents every available option, including sections the generated file leaves out.

Two settings decide where the application is reachable:

- `APP_BASE_PATH` is the public path the application is mounted at, `/main` by default. The browser API base URL is derived from it as `<APP_BASE_PATH>/api`.
- `APP_PUBLIC_ORIGIN` is the external origin used to build callback and redirect URLs. Set it in production. It must not repeat the base path — the runtime joins the two.

Run `pnpm server:config` to see what the application actually resolved, which is faster than reasoning about precedence between the file, environment variables, and defaults.

## Testing

Tests live in `tests/`, never beside the source they cover. Put logic and integration tests under `tests/logic/` and component tests under `tests/components/`. Tests needing a real server, real authentication, or a real database belong in `e2e/`.

### Notification testing

After signing in with the `notification:test` `send` permission, use the
notification logs settings page to send a real message through the durable
Notification Manager. The form is generated from safe Channel test metadata;
Email tests require an address and IM tests use the configured logical target.
The button is unavailable unless the protected targets endpoint is authorized,
and testing is disabled unless `notification.test.enabled` is explicitly set
to `true` in `config.yml`.

## Working with an AI agent

`AGENTS.md` describes how to build features here, and `skills/` holds the in-depth references it links to. If you use Claude Code, `CLAUDE.md` points at the same guidance. Keeping these accurate as your application grows is what keeps agent-written code consistent with the rest of it.

## License

MIT
