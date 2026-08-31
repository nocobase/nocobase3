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

只有数据库类型这一项需要选择，其余连接参数走默认值写进 `config.yml`。

## 参数

| 参数             | 说明                                                            |
| ---------------- | --------------------------------------------------------------- |
| `[目录]`         | 应用目录，相对当前目录。省略时进入交互式询问                    |
| `--db-dialect`   | 数据库类型：`postgres`、`sqlite`、`mysql`。省略时进入交互式选择 |
| `--no-install`   | 生成后不自动安装依赖                                            |
| `--template`     | 模板，默认 `default`。也接受已发布的包或本地包目录              |
| `--template-tag` | 具名模板走哪个渠道：`latest`（默认）或 `beta`                   |
| `--registry`     | 下载模板用的 registry，默认 `https://npm.nocobase.ai`           |
| `-h, --help`     | 查看帮助                                                        |
| `--version`      | 查看版本                                                        |

`--db-dialect` 接受常见别名，`postgresql`、`pg` 都会归一化成 `postgres`，`sqlite3` 归一化成 `sqlite`，`mysql2`、`mariadb` 归一化成 `mysql`。这三个规范名才是模板 `server/config/database.ts` 里 `DB_DIALECT` 认的值，写别的会在启动时抛错。

`--template` 用具名模板，目前只有一个 `default`，指向 `@nocobase/app-template-default`。以后新增模板会加新的名字，用户不需要知道背后的包名：

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
pnpm create @nocobase/app crm --template=./packages/app-template-default
```

依赖默认会自动安装，`--no-install` 可以跳过。

全部用参数指定就不会有任何交互，适合脚本：

```bash
pnpm create @nocobase/app crm --db-dialect=postgres
pnpm create @nocobase/app crm --db-dialect=sqlite --no-install
```

## 生成的内容

下载模板（默认 `default`，即 `@nocobase/app-template-default@latest`），并在此基础上：

- 改写 `package.json`：换成应用自己的名字和版本，置为 `private`，去掉 `publishConfig` 和 `repository`，避免误发布
- 按数据库类型装一个驱动：sqlite 装 `better-sqlite3`，postgres 装 `pg`，mysql 装 `mysql2`。模板本身只依赖 `knex`，三个驱动一个都不带
- 写 `config.yml`：写入数据库连接段和随机生成的认证密钥
- 写 `.gitignore`：模板没带的话会生成一份兜底的，防止 `config.yml` 里的认证密钥被提交
- 选 sqlite 时写 `pnpm-workspace.yaml` 的 `allowBuilds`（见下）
- 安装依赖（`--no-install` 可跳过）
- 装完依赖后跑一次应用自己的 `pnpm plugin:skills:sync`，把模板内置插件的 skills 复制进 `.agents/skills/`。这一步必须在安装之后，因为同步是从 `node_modules` 里解析插件的。同步失败只警告，不影响生成出来的应用能跑，之后随时可以在应用目录里手动补跑

## 关于 sqlite 的原生模块

pnpm 11 默认不执行依赖的安装脚本，必须在 `pnpm-workspace.yaml` 的 `allowBuilds` 里显式列出。`package.json` 的 `pnpm` 字段在 pnpm 11 已被移除，`.npmrc` 从来不读构建配置，所以这个文件是唯一入口。

少了它，`better-sqlite3` 装完不会编译原生模块，`pnpm install` 照样报成功，但应用第一次查询时会抛 `Could not locate the bindings file`——这个报错完全看不出真实原因。所以选 sqlite 时会自动写入这份配置。`pg` 和 `mysql2` 是纯 JS，不需要，也就不会生成这个文件。

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
