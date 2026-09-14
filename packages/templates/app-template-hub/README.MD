# NocoBase 3 Application

A full-stack NocoBase 3 application. The server runs on `@nocobase/app-server` and the browser client is React with Refine, shadcn/ui, and Tailwind CSS.

You own everything in this directory. Add pages, API routes, database tables, and business logic directly here — this is your application's source code, not a framework you extend from the outside.

## Getting started

Start the development server:

```bash
pnpm dev
```

`pnpm dev` starts the API server and the Vite client together, picks free ports if the defaults are taken, and prints the URL to open. Use the printed URL rather than assuming a port.

### Develop against another backend

Set `PROXY_TARGET_URL` to the backend application's public URL, including its mount path but excluding `/api`:

```bash
# Example only: replace /main with the backend's actual public mount path.
PROXY_TARGET_URL=http://127.0.0.1:13000/main pnpm dev
```

**`/main` is the fallback, not a required or fixed path.** Local development reads `APP_BASE_PATH` from the command-line environment, then `.env.local`, then `.env`, falling back to `/main` when unset. The remote path comes from `PROXY_TARGET_URL`; it is not inferred from the local `APP_BASE_PATH`. Read the target application's actual public URL before constructing this value. If it is mounted at the origin root, use the origin URL without a mount path.

For example, these applications can use different paths:

```bash
APP_BASE_PATH=/local PROXY_TARGET_URL=http://127.0.0.1:13000/crm pnpm dev
# /local/api/users -> http://127.0.0.1:13000/crm/api/users
# /local/ws        -> ws://127.0.0.1:13000/crm/ws
```

This runs Vite with your local client source and proxies API and WebSocket requests to that application. It does not start a local backend, allocate its port, wait for its health endpoint, or watch server configuration/plugins. Existing `beforeDev` hooks still run to prepare client artifacts. Open the printed **Local** URL (the Vite port); **Backend** identifies the target.

The target can be another local project running `pnpm dev`, or an HTTP(S) deployment. Use its printed application URL, not its Vite URL. Local `APP_BASE_PATH` and the remote mount path may differ: local `/main/api/users` can map to remote `/crm/api/users`. Trailing slashes are accepted. Credentials, query strings, and fragments are not accepted in the target URL.

Requests use the remote backend's data and permissions, including writes. Only `<APP_BASE_PATH>/api` and `<APP_BASE_PATH>/ws` are proxied; application root callbacks and absolute URLs returned by the backend keep their original routing. Cookie domain/path scopes are adapted to the local application. HTTP and WebSocket requests whose Origin matches the local request's protocol and Host are forwarded with the target Origin, so browser authentication and realtime connections pass the backend's same-origin checks. Same-origin Referer URLs within the local app base are mapped to the target app base as well; requests without Origin keep it absent. Other origins and referers remain unchanged and subject to backend validation. HTTPS-only cookie requirements remain enforced, and authentication flows using explicit callback URLs still require appropriate callback configuration.

The variable can also be set in `.env` or `.env.local`; the command-line environment takes precedence. Restart `pnpm dev` after changing the target. Without this variable, development still starts both the local backend and Vite. Production builds ignore it.

Use `APP_SERVER_PORT` to choose the local application port in either development mode. With `PROXY_TARGET_URL` set, it selects Vite's preferred port (5173 when unset); without a proxy target, it selects the local backend's preferred port (13000 when unset), while Vite still starts from 5173. If the preferred port is occupied, development selects the next available port and prints the actual URL. The remote backend address is always taken from `PROXY_TARGET_URL`.

```bash
APP_SERVER_PORT=13399 PROXY_TARGET_URL=http://127.0.0.1:13000/main pnpm dev
# Local: http://127.0.0.1:13399/main/ when 13399 is available.
# Replace /main with the remote application's actual mount path.
```

### Review your configuration

`config.yml` was written when the project was created, carrying the database you chose and a generated `auth.secret`. It gets you running; adjust it for your situation:

- **Database.** Point the connection at the database you actually intend to use — dialect, host, port, and credentials.
- **Where the application is served.** `APP_BASE_PATH` is the public mount path, `/main` by default, so the development URL looks like `http://127.0.0.1:13000/main/`. `APP_SERVER_PORT` and `APP_SERVER_HOST` change what the server binds to.
- **Anything a feature you enable requires** — mail delivery, IM webhooks, storage. `config.example.yml` documents common deployment options, including sections your `config.yml` does not yet have.

`config.yml` is gitignored because it holds your `auth.secret`. Deploy it through your secret management rather than committing it.

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
config.yml              Your configuration, generated at setup; gitignored
config.example.yml       Documented configuration template
skills/                  In-depth development guides for AI agents
```

The three files named `runtime.ts`, `plugins.ts`, and `routes.ts` are composition roots: they list what the application is made of. Reading them tells you what is loaded and in what order.

## Scripts

### Everyday development

| Script             | What it does                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev`         | Start the API server and client with hot reload                              |
| `pnpm build`       | Build the client and server into `dist/`                                     |
| `pnpm start`       | Run the built server; requires `pnpm build` first                            |
| `pnpm build --tar` | Build, then pack `dist/` and `config.example.yml` into `storage/dist.tar.gz` |

### Database

| Script         | What it does                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm migrate` | Apply pending migrations from your `database/main/migrations/` and from every registered plugin; `pnpm migrate --fresh --force` clears managed schema objects and rebuilds them from migrations |
| `pnpm seed`    | Run seeds from `database/main/seeds/` and from registered plugins                                                                                                                               |

Migrations also run automatically on startup while `database.connections.main.migrations.autoRun` is `true` in `config.yml`. Run `pnpm migrate` explicitly when you want to apply a schema change without restarting.

Database tasks support `--connection <name>` and `--all`; no argument targets `database.default`. Per-connection source and upgrade rules are documented in [migrations and seeds](skills/nocobase-app-development/references/migrations.md).

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

`pnpm nocobase app i18n:check` reports a language declared in `client/locales/` but not `server/locales/`, or the reverse. The browser builds its language picker from one and the server decides what it answers in from the other, so a language on only one side is one the interface offers and the server then rejects.

### Plugins

Plugins add features to your application. Let these commands edit `package.json`, `client/plugins.ts`, and `server/plugins.ts` for you rather than editing those files by hand.

| Script                          | What it does                                             |
| ------------------------------- | -------------------------------------------------------- |
| `pnpm plugin:register <name>`   | Install a plugin and wire it into the client and server  |
| `pnpm plugin:unregister <name>` | Remove a plugin and its wiring                           |
| `pnpm plugin:update [name]`     | Upgrade one or all registered plugins and re-sync skills |
| `pnpm plugin:inspect <name>`    | Report a plugin's registration state; read-only          |
| `pnpm plugin:skills:sync`       | Re-copy plugin agent skills into `.agents/skills/`       |

Use a full package name, as with `plugin:register` and `plugin:unregister`; short names such as `authentication` also work. The optional name is a positional argument, not `--plugin`.

```bash
pnpm plugin:update @nocobase/app-plugin-authentication  # Update one registered plugin
pnpm plugin:update authentication                      # Equivalent short name
pnpm plugin:update                                     # Update all registered plugins
pnpm plugin:update @nocobase/app-plugin-authentication --dry-run  # Preview only
```

Without a name, the command collects registered plugins from `client/plugins.ts`, `server/plugins.ts`, and `cli/plugins.ts`. It uses the application's package manager; with pnpm, `update` follows the declared version ranges without `--latest`. An unregistered name is rejected, and an application with no registered plugins is left unchanged. After a successful package update, all registered plugins' agent skills are re-synchronized, even when only one package was selected.

Ordering in `client/plugins.ts` and `server/plugins.ts` is contribution order, and a plugin is enabled by appearing in the array. Reorder entries or pass a plugin its options by hand; leave adding and removing entries to the commands.

### Diagnostics

| Script                      | What it does                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm client:inspect`       | Print the resolved client composition: routes, providers, and which file owns each          |
| `pnpm server:inspect`       | Print the resolved server composition                                                       |
| `pnpm server:deps:retarget` | Replace native binaries with the target platform's; part of `pnpm build`                    |
| `pnpm server:deps:verify`   | Check that everything your server and CLI import reaches a deployment; part of `pnpm build` |

These read static declarations. They report what is wired, not whether it works — a passing inspection is not a substitute for tests.

#### Deploying to a different machine

`pnpm build` produces `dist/`, which is the whole deployment: copy it to a server and run it. It carries its own `package.json`, and `pnpm install --prod` there installs exactly what the server needs.

Client packages are not among them. Plugins declare what their browser code needs as peer dependencies, so your application installs one shared copy for its Vite build, while `dist/` opts out of peer installation entirely — `lucide-react`, `@base-ui/react`, `sonner` and the rest never reach a server that has no browser in it.

**The build targets the machine you run it on**, so `pnpm build && pnpm start` works. Deploying elsewhere means saying where:

```bash
pnpm build                                        # this machine
pnpm build --target linux-x64                     # most Linux servers
pnpm build --target linux-arm64                   # ARM servers, Graviton
pnpm build --target linux-x64-musl                # Alpine, and most slim container images
pnpm build --target linux-x64 --node-version 22   # when the server runs Node 22
```

A `.node` binary is compiled for one platform, architecture, C library, and Node version at once, so a build made on a Mac installs binaries a Linux server cannot load. `--target` sets platform, architecture, and C library together, because they are chosen together: `linux-x64` and `linux-x64-musl` are different binaries, and Alpine needs the musl one. If you are unsure, `ldd --version` on the server prints `musl` for musl and `GNU libc` otherwise.

`--node-version` takes the major version your server runs, separately, because the same Linux host may run any of several. Supported: 20, 22, 24, 26.

Every build prints the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`, so a `dist/` built for the wrong machine can be identified rather than guessed at.

If your application has no native modules — `pg`, `mysql2`, and `tedious` are all plain JavaScript — none of this applies and `dist/` is portable as built.

#### Packing the build

`pnpm build --tar` writes `storage/dist.tar.gz`, the artifact you upload to a Hub to deploy this application.

The archive has two levels: `config.example.yml` and `dist/` sit at the root, and the build is inside `dist/`. What `dist/` holds varies with the application; this is the shape:

```text
dist.tar.gz
├── config.example.yml
└── dist/
    ├── cli/
    ├── client/
    ├── node_modules/
    ├── server/
    ├── package.json
    └── pnpm-workspace.yaml
```

Combine it with `--target` when the archive is for another machine:

```bash
pnpm build --target linux-x64 --tar
```

#### Adding a dependency

Where a package goes depends on which half of your application imports it.

| Imported from                     | Declare it in     |
| --------------------------------- | ----------------- |
| `server/`, `database/`, or `cli/` | `dependencies`    |
| `client/`, build tooling, tests   | `devDependencies` |

`dist/package.json` is generated from `dependencies` and is what a server installs, so a package in `devDependencies` is missing there however well it works locally. Client packages need nothing at runtime — Vite resolves and inlines them into `dist/client` while building.

Plugins' browser packages need nothing from you: a plugin declares those as peer dependencies, so installing the plugin brings one shared copy into your application, and `dist/` never installs them.

`pnpm build` verifies the server half and fails the build if something is missing, naming the package. One case it cannot check is an import whose name is assembled while the program runs:

```ts
await import(`${name}/index.js`);
```

Nothing can tell in advance which package that names, so declare it in `dependencies` when you write the code.

#### When the build or the deployment goes wrong

**`Cannot find module` on the server, but it runs locally.** The package is in `devDependencies`, which `dist/package.json` is not generated from. Move it to `dependencies` and rebuild.

**A browser package fails to resolve while building your application.** A plugin declares it as a peer dependency and something has to provide it. Add it to your `devDependencies`.

**`Error loading shared library`, `invalid ELF header`, or a bare reference to a `.node` file at startup.** The binary does not match the server. Compare what the build targeted against the server:

```bash
node -e "console.log(require('./dist/package.json').nocobase.buildTarget)"
node -p "process.platform + '-' + process.arch"   # on the server
node -p "process.versions.modules"                # on the server: the ABI
```

Rebuild with a matching `--target` and `--node-version`. ABI 115 is Node 20, 127 is Node 22, 137 is Node 24, 147 is Node 26.

**`no prebuilt binary for <target>` during the build.** The package publishes no build for that combination. Check whether the version you depend on supports the target, and whether a musl build exists if you asked for one — musl coverage is thinner than glibc.

## Configuration

`server/config/` and `client/config/` contain editable TypeScript defaults. `config.yml` holds environment-specific overrides, written for you at generation time and yours to edit from there. It is gitignored because it carries your `auth.secret`; deploy it through your secret management rather than committing it. `config.example.yml` documents common deployment options, including sections the generated file leaves out.

Two settings decide where the application is reachable:

- `APP_BASE_PATH` is the public path the application is mounted at, `/main` by default. The browser API base URL is derived from it as `<APP_BASE_PATH>/api`.
- `APP_PUBLIC_ORIGIN` is the external origin used to build callback and redirect URLs. Set it in production. It must not repeat the base path — the runtime joins the two.

Configuration is resolved from the file, environment variables, and defaults in that order of precedence.

## Testing

Tests live in `tests/`, never beside the source they cover. Put logic and integration tests under `tests/logic/` and component tests under `tests/components/`. Tests needing a real server, real authentication, or a real database belong in `e2e/`.

### Notification testing

After signing in with the `notification:test` `send` permission, use the
notification logs settings page to send a real message through the durable
Notification Manager. The form is generated from safe Channel test metadata;
Email tests require an address and IM tests use the configured logical target.
The button remains visible so configuration problems are discoverable. The
server enforces the `notification:test` `send` permission only when the message
is submitted.

## Working with an AI agent

`AGENTS.md` describes how to build features here, and `skills/` holds the in-depth references it links to. If you use Claude Code, `CLAUDE.md` points at the same guidance. Keeping these accurate as your application grows is what keeps agent-written code consistent with the rest of it.

## License

MIT
