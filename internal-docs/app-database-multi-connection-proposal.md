---
title: NocoBase 3 应用数据库多连接方案（草案 V1）
description: 按连接组织数据库源码，并补齐迁移、种子、插件贡献和 CLI 的多连接编排
---

# NocoBase 3 应用数据库多连接方案

## 文档状态

- 版本：草案 V1。
- 日期：2026-09-08。
- 状态：V1 已在工作区实施并完成验证，尚未提交或发布。
- 起点：评估将 `packages/templates/app-template-default/database/` 调整为 `database/main/`、`database/external/` 的方案。
- 适用范围：应用数据库运行时，以及 Default、Hub 两套应用模板。

本文保留最初的 V1 分析作为设计背景。下方“已确认的实施规则”记录讨论后采用的决策；后续各节中的“当前实现”和“待决策”描述均指改造前的分析快照。实际使用以两套模板的 migrations Skill 参考和配置示例为准。

## 已确认的实施规则

- 使用 `database/<connectionName>/{migrations,seeds}`，连接名与配置 key 对应，不扫描目录注册连接。
- 主库为 `database.default`；新模板默认 `main`。插件迁移、种子及运行时默认读写始终使用主库。
- 任务配置放在 `connections.<name>.migrations/seeds`。主库默认自动执行，其他连接默认不自动执行；手动命令不受 `autoRun` 限制。
- 主库优先，其余按名称稳定排序，同一连接先迁移再种子，失败即停止。结果保留完成、跳过、失败和未执行状态，失败退出码非零，不承诺跨库回滚。
- 外部模式在自动执行和 `--all` 中跳过；显式指定外部模式执行迁移或种子时报错。
- 旧顶层配置继续作用于默认连接；旧字段及原有任务环境变量覆盖同名连接内字段。不同的显式目录、重复 sources 或同时设置目录与 sources 报错。
- 默认连接支持旧目录回退；新旧约定目录同时存在时报错，允许显式选择一个来源。不会自动搬迁源码或重写历史。
- 显式来源缺失时报错；约定目录缺失允许无任务应用跳过，发布时仍须验证源码是否完整打包。
- 每个物理库及 schema 只配置一个 managed 所有者。相同配置目标的别名连接在执行前被拒绝；网络别名等无法仅靠配置可靠识别的情况需由应用维护者避免。
- 同步 Default、Hub 的目录、CLI、配置示例与开发文档，复用底层迁移、种子引擎。

## 本轮验证结果

- `@nocobase/app-server`：lint、format、typecheck、205 项测试及 build 通过。
- Default / Hub：两套模板完整 check 通过，分别为 155 / 159 项测试，最终部署包构建通过。
- 两套部署包：CLI 错误输出可解析为 JSON，退出码为 1；真实临时 SQLite 双连接迁移分别执行，第二次运行均无重复执行。
- 已覆盖连接隔离、插件只归属主库、种子历史、旧目录搬迁、自动运行策略、外部模式限制、失败中止、配置冲突、相同目标别名、SQLite 路径及编译后目录。
- changeset 校验与差异空白检查通过。本轮没有连接真实 PostgreSQL、MySQL、Oracle 或 SQL Server；这些方言沿用底层引擎。

## 1. 结论

建议采用以下目录约定：

```text
database/<connectionName>/migrations/
database/<connectionName>/seeds/
```

一级目录名对应 `database.connections` 中的连接名。目录表示“这个连接的数据库变更源码”，不是数据库类型或外部系统的分类目录。

底层 `@nocobase/db` 已具备多连接及指定连接执行迁移、种子的能力。主要工作应放在 `@nocobase/app-server` 的配置解析、任务编排、插件贡献归属和 CLI，而不是重写数据库管理器或迁移引擎。

仅调整目录不足以实现多连接支持。必须同时确保每个目录的任务显式绑定正确连接，并明确外部数据库的管理边界。

## 2. 目标与非目标

### 目标

- 支持一个应用配置并使用多个命名连接。
- 按连接隔离应用迁移、种子、执行策略及结果。
- 保留单连接应用的简单使用方式。
- 防止插件系统表被误建到业务库或第三方数据库。
- 为已有应用提供明确的旧目录和旧配置兼容路径。
- 保持 Default、Hub 两套模板的框架行为一致。

### 非目标

- 不新增跨数据库统一事务、整体回滚或分布式事务。
- 不在第一阶段实现跨连接迁移依赖图。
- 不将连接凭据分散到数据库源码目录。
- 不通过扫描目录自动注册或连接未知数据库。
- 不在第一阶段扩展完整的插件多连接部署协议。
- 不把已有外部数据库的结构导入、元数据编辑或数据同步纳入本次目录改造。

## 3. 当前实现

### 3.1 底层已支持多连接

`@nocobase/db` 的 `DatabaseManager` 支持通过连接名选择连接，查询、Repository 和事务接口也提供连接选择能力。

Migrator 和 Seeder 的创建选项均支持 `connection`，可以让各自任务运行在指定连接上。Migration Context 中的 `builder`、`query` 和 `connection` 来自所选连接。

因此不需要让每个迁移文件自行选择连接。连接绑定应由应用编排层完成，迁移文件继续专注于该连接内的确定性变更。

### 3.2 应用层仍按一套任务执行

| 环节 | 当前行为 | 多连接缺口 |
| --- | --- | --- |
| 配置类型 | `connections` 支持多个连接，但顶层 `migrations` 和 `seeds` 各只有一套 | 缺少每个连接独立的任务配置 |
| 默认目录 | `database/migrations`、`database/seeds` | 尚未按连接解析路径 |
| 启动执行 | Provider 创建一套 Migrator / Seeder，未传入连接名 | 实际落到默认连接 |
| CLI | `migrate`、`seed` 没有连接选择参数 | 无法通过应用命令指定目标连接 |
| 插件贡献 | 应用和插件迁移源合并为同一组 sources | 没有按连接分配来源 |
| 连接参数处理 | 方言默认参数和 SQLite 的部分路径处理主要针对 `main` | 需检查并推广到其他连接 |
| SQLite 存储准备 | 主要为当前默认连接准备目录 | 指定其他连接执行时需要独立准备 |

当前迁移加载器只读取指定目录中的文件，不会把连接子目录自动解释为独立任务。直接移动目录而不修改默认路径，会导致应用迁移不再被原来的来源加载。

### 3.3 模板目录现状

分析时，Default 模板的 `database/migrations/` 和 `database/seeds/` 都只有 `.gitkeep`。模板自身切换目录的成本较低，但已经生成并运行过的应用可能存在历史文件和执行记录，不能按空目录处理。

## 4. 目录设计

建议使用：

```text
database/
  main/
    migrations/
    seeds/
  analytics/
    migrations/
    seeds/
  external/
    migrations/
    seeds/
```

该示例展示目录命名方式，不表示每个连接都必须创建这两个子目录，也不表示名为 `external` 的连接必须执行迁移或种子。

规则如下：

1. `database/main/` 对应 `database.connections.main`，其他连接同理。
2. `external` 只是一个合法连接名，不是所有外部连接的总目录。连接多个外部系统时，优先使用 `erp`、`crm`、`warehouse` 等业务名称。
3. 目录名不决定方言、连接地址、权限或 `schemaManagement`，这些仍由配置决定。
4. 没有应用维护的数据库源码时，不必创建空目录。
5. 以配置中的连接为执行范围，不因磁盘出现新目录就自动注册连接或执行其中的文件。
6. 目录提供默认约定，同时允许显式覆盖迁移、种子的来源路径。

## 5. 区分连接身份与结构管理模式

“不是主库”和“不允许应用管理结构”是两个不同概念，不能都用 `external` 表达。

### 5.1 应用管理的第二个数据库

例如应用自行维护的分析库：

- 连接名可以是 `analytics`。
- 使用 `schemaManagement: managed`。
- 可以维护自己的迁移和种子。
- 独立绑定目标连接，使用该连接上的迁移历史和锁。

这是按连接分目录最直接的适用场景。

### 5.2 接入已有外部数据库

例如由第三方系统维护的 ERP 数据库：

- 连接名可以是 `erp`。
- 使用 `schemaManagement: external`。
- 不因为存在源码目录就自动执行迁移或种子。
- `external` 表示结构管理边界，不等价于数据库账号只读。

当前底层 Migrator 会拒绝对 `external` 模式执行迁移，DatabaseManager 在创建该类连接时还要求显式提供 `metadataStore`。外部连接接入方案必须同时处理元数据存储，不能只增加连接配置和目录。

当前 Seeder 会在目标库创建自己的历史表和使用锁机制，因此“种子只插入业务数据”也不代表执行过程不会涉及结构写入。第一版建议应用层不自动向外部模式连接运行种子；专门支持外部库数据初始化应另行设计。

## 6. 配置方案

### 6.1 建议形态

倾向于将连接专属的迁移和种子配置放在 `connections.<name>` 下，避免另外维护一份需要与连接名保持同步的映射。

以下是拟议配置，不是当前已支持的格式。连接地址和凭据省略；外部连接所需的 `metadataStore` 由运行时另外提供，此示例不构成完整可运行配置。

```yaml
database:
  default: main
  connections:
    main:
      dialect: sqlite
      database: database.sqlite
      schemaManagement: managed
      migrations:
        autoRun: true
      seeds:
        autoRun: true

    analytics:
      dialect: postgres
      database: analytics
      schemaManagement: managed
      migrations:
        autoRun: false
      seeds:
        autoRun: false

    erp:
      dialect: postgres
      database: erp
      schemaManagement: external
```

### 6.2 配置职责

- `default` 保持默认连接选择的职责。
- 连接配置描述连接参数和结构管理模式。
- `migrations`、`seeds` 描述该连接的应用任务策略，而不是数据库驱动参数。
- 未覆盖的目录按 `database/<name>/migrations`、`database/<name>/seeds` 解析。
- `autoRun` 控制启动时自动执行，不应直接被当作手动 CLI 执行的总开关。

实现时应在应用层扩展连接配置类型，并将任务配置与传给底层 DatabaseManager 的连接参数分离。无需让通用 `@nocobase/db` 理解应用目录约定。

第一阶段建议 `main` 保留现有模板的自动执行体验，新增连接显式开启自动执行。默认值如何与自定义默认连接、旧配置合并，需要在实现前确定，不能依赖连接声明顺序。

## 7. 运行时编排

### 7.1 单连接执行单元

每个执行单元至少包含：连接名、任务类型、sources、历史表及锁表配置、执行策略。

执行流程建议为：

1. 从配置解析目标连接与任务配置。
2. 校验连接存在、管理模式和路径配置。
3. 准备目标连接所需的本地存储目录。
4. 创建 Migrator / Seeder，显式传入 `connection: name`。
5. 执行任务，并在结果中保留连接身份。

不得只切换 sources 而继续省略连接名，否则其他目录中的迁移仍可能运行在默认库。

### 7.2 多连接执行

- 启动时只执行显式符合自动运行策略的任务。
- 第一阶段优先串行执行，顺序必须稳定、可解释，不依赖文件系统遍历顺序。
- 同一连接内先迁移、后种子。
- 不承诺跨连接事务；一个连接失败时，先前连接已成功提交的变更不会自动撤销。
- 返回或记录各连接的完成、跳过和失败状态，避免只输出一个无法定位目标库的总结果。

对于 `--all` 及启动流程，主库优先规则、失败后是否立即停止和部分成功结果格式列为待决策项。第一版不引入跨连接依赖声明。

历史和锁应随目标数据库隔离。如果两个逻辑连接实际指向同一物理库及 schema，仅连接名不同并不能自动隔离历史表与锁表；实现前应明确是限制此类配置，还是要求显式区分表名。

## 8. 插件迁移归属

当前应用与插件迁移源会合并为一组。多连接后不能将这组 sources 复制到每个连接，否则认证、权限等插件表可能出现在分析库或第三方数据库中。

第一阶段建议：

- 应用源码按连接目录归属。
- 插件迁移和种子继续绑定应用主库，不自动分发到新增连接。
- 不改变插件内部已有目录结构。
- 只有出现明确需求时，再扩展插件声明和应用侧绑定协议。

“插件主库”与 `database.default` 的关系必须明确。现有行为是运行在默认连接，不能在兼容已有应用时无条件改为固定 `main`；但也不应在新设计中因为修改查询默认连接，就无意改变插件系统表的部署位置。该绑定规则是实现前需要确认的重点。

## 9. CLI 方案

拟新增以下用法，当前命令尚不支持这些参数：

```bash
pnpm migrate --connection main
pnpm migrate --connection analytics
pnpm seed --connection analytics
pnpm migrate --all
pnpm seed --all
```

建议语义：

- 不传参数：仍只执行默认连接，避免引入多连接后扩大原命令的影响范围。
- `--connection <name>`：显式选择一个连接，不受该连接 `autoRun: false` 限制。
- `--all`：显式请求对符合执行条件的连接执行任务；不能简单解释为忽略管理模式遍历全部连接。
- `--connection` 与 `--all` 互斥。
- 未知连接或显式请求不支持的外部库操作时，明确报错。
- 多连接输出及 JSON 结果带连接名；存在失败时不能仅报告整体成功。

`--all` 的外部连接跳过说明、失败中止规则，以及现有单连接 JSON 格式的兼容策略，应在实现阶段统一设计。

## 10. 旧目录与历史兼容

### 新应用

新模板直接采用 `database/main/migrations/` 和 `database/main/seeds/`，其他连接按需增加目录。

### 已有应用

- 为旧顶层 `database.migrations`、`database.seeds` 和旧目录提供明确兼容路径。
- 旧任务应映射到原本执行它们的连接，而不是无条件绑定 `main`。
- 新旧配置或目录同时存在时，明确优先级或报错，不静默合并执行。
- 普通启动、迁移命令不应自动搬迁用户源码。
- 不把“移动到其他连接目录”当作历史迁移在另一个数据库上重新执行的授权。

迁移历史文件搬迁应保持文件名、导出的 `name`、内容、包标识以及原目标数据库不变。迁移加载器基于文件内容计算 checksum，迁移执行还会校验历史中已执行文件是否存在。

目录切换必须通过测试确认历史校验正常、已执行迁移不会重跑。不要通过改写历史文件或伪造旧 checksum 绕过校验；种子历史也需要覆盖兼容验证。

## 11. 实施范围与步骤

### 第一步：补齐应用层能力

- 扩展应用数据库配置类型与 Schema。
- 增加按连接解析任务及 sources 的公共逻辑，供 Provider 和 CLI 共用。
- 显式绑定目标连接，补齐外部模式校验及分连接结果。
- 推广连接参数规范化与 SQLite 目录准备，避免继续只处理 `main` 或默认连接。
- 明确插件贡献只属于主库，不向所有连接复制。

### 第二步：切换目录并完善兼容

- 同步调整 Default、Hub 两套模板目录和配置示例。
- 补齐 CLI 参数、帮助和 JSON 兼容策略。
- 更新两套模板的开发文档、AGENTS、Skill 和测试中的旧路径说明。
- 验证开发态、编译产物和发布后运行时的目录解析一致。
- 补齐旧项目升级说明及历史不重复执行的测试。

底层数据库引擎原则上复用；只有测试暴露出底层缺口时，再针对具体问题修改 `@nocobase/db`。不为应用目录约定增加不必要的通用引擎复杂度。

## 12. 验收要点

| 场景 | 预期 |
| --- | --- |
| 单连接新模板 | 主库迁移、种子和插件初始化正常 |
| 两个 managed 连接 | 各目录只修改其目标库，历史分别记录 |
| 非默认连接手动执行 | `--connection` 正确路由，不误写默认库 |
| 新增连接关闭 autoRun | 启动不执行，但允许显式手动执行 |
| external 模式 | 不自动运行迁移和种子，显式不支持操作有清晰错误 |
| 插件贡献 | 系统表仅部署到约定主库 |
| 旧项目升级 | 旧任务保持原连接归属，已执行历史不重跑 |
| 新旧配置或目录并存 | 按明确规则处理，不静默重复执行 |
| 多连接部分失败 | 能定位失败连接，不声称跨连接整体回滚 |
| SQLite 非默认连接 | 文件路径和父目录准备正确 |
| 构建后运行 | 编译产物仍可按连接找到迁移和种子 |
| Default 与 Hub | 同样的框架行为和验证覆盖 |

实际实施时应对修改包及其相关消费者运行范围内的 lint、typecheck、test、build，并运行两套模板的 check。最初仅新增内部草案时不涉及发布产物；本轮实施涉及 app-server 与两套模板，需包含 changeset 并完成上述验证。

## 13. 待决策项

1. 是否最终采用 `connections.<name>.migrations/seeds`，旧顶层配置保留多久？
2. 插件主库是否继续等同于默认连接，还是增加稳定的显式绑定？
3. 新连接的默认执行策略如何定义，是否需要独立于 `autoRun` 的任务启用开关？
4. 多连接的顺序、部分失败中止规则和结构化结果如何确定？
5. 新旧目录同时存在时采用严格报错还是兼容优先级？
6. 指向同一物理库及 schema 的多个连接如何处理历史表和锁冲突？
7. 外部库数据初始化是否有真实需求；若有，是否另设不写目标库历史表的机制？

第一版优先确认目录约定、连接绑定和主库语义，再落实配置及 CLI 细节，避免把目录调整做成缺少边界定义的隐式多库执行。

## 14. 当前实现参考

以下路径相对仓库根目录，用于核对本次分析依据：

- `packages/libs/db/src/database/manager.ts`：连接选择、查询接口和外部连接的 metadataStore 要求。
- `packages/libs/db/src/migration/types.ts`：迁移来源、Context 及连接选项。
- `packages/libs/db/src/migration/migrator.ts`：目标连接、管理模式校验和执行历史校验。
- `packages/libs/db/src/migration/loader.ts`：目录文件加载和 checksum。
- `packages/libs/db/src/seed/seeder.ts`：种子目标连接和执行流程。
- `packages/libs/db/src/seed/internal/history.ts`：目标库中的种子历史表。
- `packages/app/app-server/src/database/types.ts`：当前应用数据库配置类型。
- `packages/app/app-server/src/database/config.ts`：默认路径、Schema 和环境变量映射。
- `packages/app/app-server/src/database/provider.ts`：启动时迁移和种子执行。
- `packages/app/app-server/src/database/tasks.ts`：CLI 使用的应用任务入口。
- `packages/app/app-server/src/database/manager.ts`：连接参数处理。
- `packages/app/app-server/src/database/storage.ts`：SQLite 存储目录准备。
- `packages/app/app-server/src/plugins/resolve.ts`：应用和插件数据库来源合并。
- `packages/templates/app-template-default/cli/commands/migrate.ts`：现有迁移命令。
- `packages/templates/app-template-default/cli/commands/seed.ts`：现有种子命令。
- `packages/templates/app-template-default/tsconfig.server.json`：数据库源码的编译范围。
- `packages/templates/app-template-default/skills/nocobase-app-development/references/migrations.md`：当前应用迁移规范。
