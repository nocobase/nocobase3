# @nocobase/create-app

创建 NocoBase 3 应用。

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app crm
```

`pnpm create @nocobase/app` 会解析成 `@nocobase/create-app` 包并执行它，包名之后的所有参数原样透传。

## 为什么要带 `npm_config_registry`

这里涉及两次下载，发生在不同阶段，各自读不同的配置：

```
阶段 1  pnpm 去 registry 找 @nocobase/create-app 这个包
        ← npm_config_registry 管这里（此时我们的代码还没运行）

阶段 2  create-app 跑起来，去下载应用模板
        ← --registry 管这里，默认已经是 https://npm.nocobase.ai
```

这个包目前只发布在自建 registry，而 `pnpm create` 默认从公共 npm 解析包名，所以阶段 1 需要把解析地址指过去，否则会直接 404：

```
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@nocobase%2Fcreate-app: Not Found
```

`pnpm create` 自己不支持 `--registry`——写在包名之后会被当作透传参数交给我们的程序，写在包名之前会被当成包名的一部分。所以只能用环境变量，或者在 `~/.npmrc` 里配一次：

```
@nocobase:registry=https://npm.nocobase.ai
```

配过之后命令里就不用带前缀了。包发布到公共 npm 之后，这一节整个都不再需要。

注意 `--registry` 替代不了它：那是本程序自己的参数，只有进程启动之后才会被解析，而阶段 1 失败时进程根本没起来。反过来，阶段 2 的默认值本来就是自建 registry，所以日常也不需要写 `--registry`。

## 关于 dist-tag

**不要给包名加 `@beta`。** 现阶段 `beta` 这个 tag 指向的是最旧的版本，不是最新的：

```
latest: 0.1.0-beta.1   ← 最近一次发布
beta:   0.1.0-beta.0   ← 第一次发布，之后再没动过
```

这是 changesets 的行为：一个包如果所有已发布版本都是预发布版，它就认为这是首次发布，把 tag 打到 `latest` 以保证包能被 `npm install` 装到，而不打到 `beta`。这个判定在发出第一个稳定版之前每次发版都成立，所以 `beta` 停在最初那次，`latest` 才是最新的。

发第一个稳定版之后这个问题会自行消失，那时 `beta` 会恢复正常跟进。

想确认当前状态：

```bash
npm view @nocobase/create-app dist-tags --registry=https://npm.nocobase.ai
```

同样的原因，模板的 `--template-tag` 默认也是 `latest`。

## 交互

不带参数时会依次询问目录和数据库类型：

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app
```

For App templates and Hubs declaring the app-v1 scaffold profile, only the database dialect is prompted for; connection defaults are written to config.yml. Legacy Hub templates without that profile skip database initialization.

## 参数

| 参数             | 说明                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `[目录]`         | 应用目录，相对当前目录。省略时进入交互式询问                                                                    |
| `--db-dialect`   | Database dialect for App initialization: postgres, sqlite, mysql; prompted when omitted. Legacy Hubs ignore it. |
| `--no-install`   | 生成后不自动安装依赖                                                                                            |
| `--template`     | 模板，默认 `default`。也接受已发布的包或本地包目录                                                              |
| `--template-tag` | 具名模板走哪个渠道：`latest`（默认）或 `beta`                                                                   |
| `--registry`     | 下载模板用的 registry，默认 `https://npm.nocobase.ai`                                                           |
| `-h, --help`     | 查看帮助                                                                                                        |
| `--version`      | 查看版本                                                                                                        |

The database flag accepts aliases: postgresql and pg normalize to postgres,
sqlite3 to sqlite, and mysql2 and mariadb to mysql. The canonical dialects match
the shared application-server database configuration and its DB_DIALECT mapping.
App templates and Hubs declaring app-v1 prompt for a missing dialect; legacy Hub
templates without that profile warn and ignore the flag.

The named templates are default (the @nocobase/app-template-default package) and
hub (the @nocobase/app-template-hub package). A package specifier or local template
path can also be supplied:

```bash
pnpm create @nocobase/app crm --template=default   # 默认值，可以不写
```

`--template-tag` 决定具名模板拉哪个渠道，默认 `latest`：

```bash
pnpm create @nocobase/app crm --template-tag=beta
```

**注意 `beta` 目前拉到的是最旧的版本，不是最新的。** changesets 把 `beta` 这个 dist-tag 留在了包首次发布的那个版本上，之后每次发版只更新 `latest`——它认为「所有版本都是预发布版」的包属于首次发布，于是打 `latest` 保证包能被安装。这个条件在发出第一个稳定版之前一直成立。所以默认是 `latest`，`--template-tag=beta` 只在你确实要那个特定版本时才用。

名字之外的值原样使用，所以指定具体版本或本地目录照常可用。这种情况下 `--template-tag` 会被忽略——你已经说明了要哪个版本，再追加渠道反而会覆盖掉更精确的请求：

```bash
pnpm create @nocobase/app crm --template=@nocobase/app-template-default@0.0.1-beta.3
pnpm create @nocobase/app crm --template=./packages/templates/app-template-default
```

依赖默认会自动安装，`--no-install` 可以跳过。

全部用参数指定就不会有任何交互，适合脚本：

```bash
pnpm create @nocobase/app crm --db-dialect=postgres
pnpm create @nocobase/app crm --db-dialect=sqlite --no-install
```

## 生成的内容

The generator downloads the selected template (default resolves to
@nocobase/app-template-default@latest) and performs these shared steps:

- Replace the package name and displayName while preserving the template version
  and existing private status; remove description, publishConfig, and repository.
- Restore the template's gitignore or write a fallback when none is supplied.
- Write or merge pnpm-workspace.yaml build settings for every template, regardless
  of database dialect. The build allowlist does not itself install a package.
- Install dependencies unless --no-install is supplied.

App templates, including older App templates without a profile, and Hub templates
declaring app-v1 additionally receive:

- One selected runtime driver: better-sqlite3 for SQLite, pg for PostgreSQL, or
  mysql2 for MySQL. The official templates do not declare these drivers themselves.
- config.yml containing database defaults and a freshly generated secret shared
  by auth.secret and session.secret.
- Native SQLite driver verification after installation, with a rebuild attempt
  when necessary, followed by plugin:skills:sync. Skill synchronization failures
  are warnings and can be retried manually.

Every Hub also receives its identity/mount environment file and app-dist placeholder.
A Hub without the app-v1 profile retains legacy initialization: no database prompt,
no generated database config, no added driver, and no plugin skill synchronization.

## 关于 sqlite 的原生模块

pnpm 11 默认不执行依赖的安装脚本，必须在 `pnpm-workspace.yaml` 的 `allowBuilds` 里显式列出。`package.json` 的 `pnpm` 字段在 pnpm 11 已被移除，`.npmrc` 从来不读构建配置，所以这个文件是唯一入口。

Without build permission, better-sqlite3 may install without a usable native
addon and fail with "Could not locate the bindings file" on its first query.
The generated workspace build settings include better-sqlite3 and esbuild for
all templates. PostgreSQL and MySQL still receive that workspace file, although
their pg and mysql2 drivers are pure JavaScript and need no native build entry.

还有一种情况：如果 npm 配置里有 `ignore-scripts=true`，它会全局压制所有安装脚本，优先级高于 `allowBuilds`。create-app 装完会实际加载一次驱动来验证，发现装了但加载不了时会自动跑一次 `pnpm rebuild <驱动>` 补上编译——`pnpm rebuild` 针对单个包，不需要改动全局设置。自动修复失败才会提示，并给出可直接执行的命令。

（注意 `pnpm install --config.ignore-scripts=false` 在这种情况下没用：包已经在 store 里，pnpm 会跳过它并报成功，但什么都没编译。必须用 `pnpm rebuild`。）

## 开发

```bash
node ./bin/run.js crm --db-dialect=sqlite   # 直接跑源码，Node 24 原生擦除类型
pnpm --filter @nocobase/create-app build
pnpm --filter @nocobase/create-app check    # lint + format + typecheck + test + build
```

入口 `bin/run.js` 会自动判断运行模式：源码目录存在 `src/create.ts` 时加载 `src/`，发布安装后加载 `dist/`。发布产物必须走 `dist`，因为 Node 拒绝对 `node_modules` 里的 `.ts` 做类型擦除。设置 `NOCOBASE_CREATE_APP_USE_DIST=1` 可以在源码目录里强制用 `dist` 验证发布形态。

开发模板本身时把 `--template` 指向本地目录：

```bash
node ./bin/run.js crm --db-dialect=sqlite --template ../app-template-default
```

本地目录会用 `pnpm pack` 打包，把 `workspace:` 和 `catalog:` 解析成真实版本号，因此生成的项目在仓库之外也能安装。

## Full-stack Hub templates

The named templates are `default` and `hub`. The current official templates declare
`nocobase.scaffoldProfile: "app-v1"` in their package manifests. This profile opts into
the existing App initialization contract: database selection, generated `config.yml`
with a random authentication/session secret, a runtime database driver, native
SQLite driver verification after installation, and plugin skill synchronization.

```bash
pnpm create @nocobase/app my-hub --template=hub --db-dialect=sqlite
```

A full-stack Hub retains `templateKind: "hub"` and also receives `.env` for its identity
and mount settings. Its default generated mount path is `/hub`; a template's explicit
`APP_BASE_PATH` is preserved. Use `pnpm dev` during development, or `pnpm build` followed
by `pnpm start`. PostgreSQL/MySQL connections must be edited in `config.yml` before starting.

The profile is read from the downloaded manifest for named, package, and local
templates alike. Unsupported profile values fail before the target is written.
Hub templates that omit the profile retain legacy initialization: no database
prompt, generated database configuration, or added driver; `--db-dialect` is warned
about and ignored. App templates without the field keep their existing behavior.
Use a compatible generator and a profile-bearing template together: upgrading the
generator alone cannot infer the capabilities of an unmarked historical Hub.

`--no-install` still writes configuration and driver dependencies, but skips installation,
driver verification, and skill synchronization. Workspace build settings are generated
for all templates, including PostgreSQL/MySQL and legacy Hubs; an allowBuilds entry
alone does not install a driver. Scaffold preserves the template version and existing
private status while replacing its name/displayName and removing publish metadata.
