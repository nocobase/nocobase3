# NocoBase 3 Examples

A full-stack NocoBase 3 application. The server runs on `@nocobase/app-server` and the browser client is React with Refine, shadcn/ui, and Tailwind CSS.

You own everything in this directory. Add pages, API routes, database tables, and business logic directly here — this is your application's source code, not a framework you extend from the outside.

This is the examples template, based on `@nocobase/app-template-default`. It is a standalone application with its own database and configuration. Default provides a clean starting template with product capabilities and no example plugins.

The homepage links to article management, repository queries, CRM, orders, file management, and routes. Additional registered plugins demonstrate services, queues, realtime, CLI commands, and Skills. Plugin demonstrations remain in their own packages under `packages/examples/`; the article page demonstrates application-owned development.

## Create an examples application

After this template and the updated scaffolder have been published:

```bash
pnpm create @nocobase/app my-examples --template examples
```

Before publication, from the source repository root:

```bash
pnpm --filter @nocobase/create-app build
node packages/tools/create-app/bin/run.js my-examples --template ./packages/templates/app-template-examples --db-dialect sqlite
```

The scaffolder creates an independent configuration and database. Never copy another application's `config.yml`, `.env`, `storage/`, or generated `dist/` into this template.

Article migration and seed sources create six articles on a fresh managed default connection. Existing system administrators receive an `articles-manager` permission set during the application's first eligible startup. Later edits and revoked assignments are preserved. Other examples retain their plugins' authorization policies.

## Maintain this template

Keep framework files aligned with Default and Hub: startup/build scripts, runtime composition mechanisms, shell, theme, CLI infrastructure and development guidance. Keep the examples homepage, article module, example plugin choices and sample data here. Existing Default installations retain their historical data; see Default’s `MIGRATION.md` when upgrading to its clean composition.

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
├── main/
│   ├── migrations/      Schema history for the main connection
│   └── seeds/           Initial example data
└── analytics/
    ├── migrations/      Independent analytics schema
    └── seeds/           Channel, campaign and daily metric examples

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

| Script         | What it does                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm migrate` | Apply pending migrations from your `database/main/migrations/` and from every registered plugin |
| `pnpm seed`    | Run seeds from `database/main/seeds/` and from registered plugins                               |

Migrations also run automatically on startup while `database.connections.main.migrations.autoRun` is `true` in `config.yml`. Run `pnpm migrate` explicitly when you want to apply a schema change without restarting.

Database tasks support `--connection <name>` and `--all`; no argument targets `database.default`. Per-connection source and upgrade rules are documented in [migrations and seeds](skills/nocobase-app-development/references/migrations.md).

### Analytics database example

The application supplies an independent managed `analytics` SQLite connection,
stored at `storage/analytics.sqlite` when running standalone. Its defaults are
loaded before `config.yml`, so existing and generated main-only configurations
work, and explicit file settings can override the connection. `main` remains the
system database. This demonstration belongs only to Examples.

Migrations and seeds run automatically on startup. To initialize only analytics
from this application directory:

```bash
pnpm migrate --connection analytics
pnpm seed --connection analytics
```

| Collection     | Initial records | Purpose                                                        |
| -------------- | --------------- | -------------------------------------------------------------- |
| `channels`     | 3               | Search, social and email channels; unique channel code         |
| `campaigns`    | 4               | Channel-linked campaigns in draft, active and completed states |
| `dailyMetrics` | 12              | One row per campaign and date for September 6–8, 2026          |

Channels have many campaigns; campaigns have many daily metrics. Each campaign
and date pair is unique. Deleting a campaign cascades to its metrics; deleting a
channel with campaigns is rejected. Budgets, spend and revenue are integer cents.
The draft campaign has zero metrics to demonstrate the distinction between zero
and absent data. Seeds use stable IDs and a transaction; normal reruns preserve
edits and deletions, and explicit replays insert only missing identities.

`server/routes/analytics.ts` exposes the following through
`defineRepositoryApiRoutes`, each explicitly bound to `analytics`:

| Repository API name     | Collection     |
| ----------------------- | -------------- |
| `analyticsChannels`     | `channels`     |
| `analyticsCampaigns`    | `campaigns`    |
| `analyticsDailyMetrics` | `dailyMetrics` |

Each supports `findMany` (maximum 100), `findOne`, `count`, `exists`, `aggregate`,
`groupBy`, `createOne`, `updateOne`, and `deleteOne`. Like the Repository example
plugin, all signed-in users can manage the sample records. Server write policies
allow only declared fields; use `channel.connect` and `campaign.connect` for
relations. IDs are accepted on creation but cannot be changed through updates.

Requests use `POST <app-base>/api/<repository>:<action>`, for example
`POST /main/api/analyticsDailyMetrics:groupBy` with this JSON body:

```json
{
  "by": ["campaignId"],
  "aggregate": {
    "kind": "aggregate",
    "version": 1,
    "items": [
      { "kind": "count", "alias": "days" },
      { "kind": "sum", "field": "spendCents", "alias": "spendCents" },
      { "kind": "sum", "field": "revenueCents", "alias": "revenueCents" }
    ]
  }
}
```

The response is wrapped in `{ "data": ... }`. Use the application's authenticated
API client, for example `api.repository('analyticsChannels').findMany({ limit: 10 })`.

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

`config.yml` is the single source of configuration, written for you at generation time and yours to edit from there. It is gitignored because it carries your `auth.secret`; deploy it through your secret management rather than committing it. `config.example.yml` documents every available option, including sections the generated file leaves out.

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
The button is unavailable unless the protected targets endpoint is authorized,
and testing is disabled unless `notification.test.enabled` is explicitly set
to `true` in `config.yml`.

## Working with an AI agent

`AGENTS.md` describes how to build features here, and `skills/` holds the in-depth references it links to. If you use Claude Code, `CLAUDE.md` points at the same guidance. Keeping these accurate as your application grows is what keeps agent-written code consistent with the rest of it.

## License

MIT

## Workflow examples

Open **Workflow examples** on the homepage, or **Settings → Automation → Workflows**.
The three application-owned packages under `server/workflows/` are built by
`pnpm dev` and `pnpm build`. Enable a definition, open its detail page, choose
**Run**, and enter the sample values below. Inspect the run diagram and select a
node to see its output, errors, and logs.

| Workflow                        | Sample input                                    | Expected result                                                                    |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Example: Quotation routing      | `quotationId: Q-100`, `amountCents: 50000`      | Standard branch, followed by the shared summary node.                              |
| Example: Quotation routing      | `quotationId: Q-100`, `amountCents: 150000`     | Manual follow-up classification. This is not a human approval or waiting step.     |
| Example: Analytics daily report | `date: 2026-09-08`                              | Read four seeded metric rows, calculate totals, and save one report for that date. |
| Example: Analytics daily report | `date: 2000-01-01`                              | Successful early termination without creating a report.                            |
| Example: Failure diagnostics    | `reference: DIAG-100`, `simulateFailure: true`  | The execute node fails deliberately; the finish node does not run.                 |
| Example: Failure diagnostics    | `reference: DIAG-100`, `simulateFailure: false` | A new run completes all three steps.                                               |

Quotation routing exposes an administrator parameter, `reviewThresholdCents`,
whose default is `100000`. Amounts at or above the threshold take the follow-up
branch. Parameter changes apply to new runs; existing executions retain their
parameter snapshots. The quotation and diagnostic examples only produce workflow
execution evidence, with no external side effects.

The report reads `analytics.dailyMetrics` and upserts `exampleDailyReports` in the
application's default database by its unique date. With unchanged seed data,
`2026-09-08` produces 96,000 impressions, 3,120 clicks, 168 conversions, 93,000
spend cents, 672,000 revenue cents, and 579,000 profit cents. The `saveReport`
node output contains the saved report. Repeating the workflow refreshes that date's
report instead of inserting duplicates. Reports are application-owned data;
workflow definitions and execution history remain owned by the plugin. Reading
analytics and writing the report are separate operations, not a cross-database
transaction.

For development, check a package and regenerate development artifacts after editing:

```bash
pnpm nocobase workflow check server/workflows/example-quotation-routing
pnpm nocobase workflow check server/workflows/example-analytics-report
pnpm nocobase workflow check server/workflows/example-failure-diagnostics
pnpm nocobase workflow build
```

Enable the newly built revision in the management UI before invoking it as a
business workflow. Source validation, artifact generation, enablement, and
execution are distinct steps. Never seed or edit the plugin's materialized tables.
Production artifacts contain the JavaScript emitted by the normal server build.
Keep the workflow artifact disk under the deployed application directory (the
default local storage layout), so run modules resolve the same application
`node_modules` and service tokens. Moving that disk outside the application tree
currently requires a deployment-level module-resolution arrangement; an arbitrary
external storage directory cannot resolve the report workflow’s `@nocobase/db`
import on its own.

Application code invokes an enabled package through the public
`workflowServiceToken.trigger(key, input, { eventKey })` contract. An `accepted`
receipt is not completion; execution is asynchronous. A `skipped` receipt creates
no run. Reusing an event key deduplicates the same submission and does not replay
a failed execution. The management UI starts a new manual run for each Run action.
These examples do not implement approval, durable waits, node replay, or automatic
retry. The plugin's management APIs currently require sign-in without per-action
ACL; keep these workflows on demonstration data. Business trigger endpoints must
supply their own authentication, authorization, and input validation.

## 数字类型示例

首页的“数字类型”卡片和侧栏入口打开 `/numeric-examples`。页面调用当前默认数据库的
`GET /api/numeric-examples`，可切换 Query / Repository 和全部样本、空值样本、空结果。
接口仅供已登录用户读取共享示例数据，不开放写入或任意 SQL。

`database/main/migrations/202609100002_create_numeric_examples.ts` 创建
`numericExamples`，声明 `increments` ID、唯一的样本名称以及 INTEGER、BIGINT、
DECIMAL(30,6)、FLOAT、DOUBLE 字段。
`database/main/seeds/202609100002_seed_numeric_examples.ts` 使用 Query insertInto
插入七组固定样本：小整数、负数、零、相邻的大整数、小数和空值。
BIGINT 使用字符串 `9007199254740992` / `9007199254740993`，不会先转成 JavaScript number。
重复执行种子不会覆盖已编辑的同名样本；初始化数据是 Examples 模板的教学内容。

应用启动时按现有配置执行迁移与种子。关闭自动执行时，在模板目录运行：

```sh
pnpm migrate
pnpm seed
```

页面使用带引号的 JSON 值和实际 JavaScript 类型标签展示普通读取，并支持按 increments、INTEGER、BIGINT、DECIMAL、FLOAT 或 DOUBLE 升序 / 降序排序，以及查看各字段的 COUNT、SUM、AVG、MIN、MAX。DECIMAL 保留数据库格式；SQLite 的底层存储精度限制、
浮点舍入和 increments 的数据库差异均保持可见，不在页面中做 Number() 转换或补零。
空值样本的 ID 非空，所以 COUNT(id) 为 1；其他数字字段 COUNT 为 0。

后端实现位于 `server/providers/numeric-examples-service.ts` 和
`server/routes/numeric-examples.ts`，页面位于 `client/pages/numeric-examples.tsx`。
这是 Examples 独有内容，不改变 Default / Hub 模板或数据库运行时。

## Numeric types example

Open **Numeric types** from the homepage or navigation (`/numeric-examples`).
The page reads the current default database through the authenticated, read-only
`GET /api/numeric-examples` endpoint. Switch between Query and Repository, or
select all samples, the null sample, and empty input. Tables show actual JSON
values and JavaScript types, plus COUNT(field), SUM, AVG, MIN and MAX.

The application owns `numericExamples`: an `increments` ID, a unique sample key,
and INTEGER, BIGINT, DECIMAL(30,6), FLOAT and DOUBLE fields. The migration is
`database/main/migrations/202609100002_create_numeric_examples.ts`; initial data
lives in `database/main/seeds/202609100002_seed_numeric_examples.ts`. Run
`pnpm migrate` and `pnpm seed` when automatic startup tasks are disabled. Seeds
insert missing sample keys and preserve existing records on repeat runs.

Seven fixed samples include 42, negatives, zero, the adjacent BIGINT values
9007199254740992 and 9007199254740993, fractions and nulls. Exact inputs use
strings; the page never converts BIGINT or DECIMAL to Number. Decimal formatting
and native floating arithmetic may differ by database. SQLite still has numeric
storage precision limits, and increments uses each database's physical ID type.
Every signed-in user may read these sample records; the endpoint exposes no
writes or arbitrary collection/query parameters. Row previews are capped at 100;
aggregates cover the entire selected sample set.

This is Examples-only teaching content, so it does not change Default or Hub.
