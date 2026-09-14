# 应用 Collection 文件设计

状态：第一阶段实施中（`@nocobase/db` 序列化模块与 `@nocobase/app-server` 的 `generateAppCollectionsArtifact()` 已落地，模板命令入口待补）

## 目的

应用需要一套可以纳入版本控制的 Collection 表示，供开发者、文档工具和 AI 在不连接数据库的情况下了解当前的数据模型。这套表示必须区分三样东西：物理数据库事实、补充元数据、以及两者合成之后的逻辑 Collection 视图。

数据库 migrations 仍然是 Schema 变更的唯一权威历史。本文描述的文件全部是从已迁移的数据库读出来的产物，它们记录结果，不驱动变更。

## 非目标

第一阶段不做以下事情，后文"分阶段"一节说明它们为什么以及何时可能加入：

- 运行时不读取这些文件。`connection.collections` 的解析与缓存行为不变，冷启动仍然查询物理 catalog。
- 这些文件不是元数据的编辑入口。补充元数据的修改仍然通过 Builder、Migration 或 Collection Metadata Service 写入数据库。
- 不从这些文件生成 migration，也不做声明式定义与线上 Schema 的 diff。

## 目录结构

文件按数据库连接和逻辑 Collection 名称分组，放在应用已有的 `database/<connection>/` 之下：

```text
database/
  main/
    migrations/
    seeds/
    collections/
      _manifest.json
      articles/
        collection.json
        metadata.json
        schema.json
  analytics/
    collections/
      _manifest.json
      dailyMetrics/
        collection.json
        metadata.json
        schema.json
```

一表一目录，而不是 `articles.collection.json` 这样的扁平后缀命名。Collection 是这里的生命周期单位：创建、删除、改名都对应一个目录的出现、消失和移动，目录列表本身就是 Collection 目录。代价是编辑器里多张表的同名文件只能靠路径区分，这一点接受。

目录名使用逻辑 Collection 名称，不使用物理表名。命名规则和表前缀会把逻辑名映射到不同的物理标识符，而读者关心的是逻辑名。目录名的安全规则见"名称安全"一节。

`_manifest.json` 是连接级的清单，不属于任何一个 Collection，用下划线前缀与 Collection 目录区分。

## 文件的来源与内容

三个 Collection 文件来自 `connection.collections` 上的两次读取加一次元数据读取：`getResolution(name)` 给出 `{ collection, inspection, warnings }`，`getPhysical(name)` 给出完整的 `PhysicalCollectionSchema`，`connection.collectionMetadata.get(name)` 给出存储文档。`inspection` 只是各个方面（列、索引、约束等）的检查完整度状态，不含列和索引本身，所以物理结构必须另取；`PhysicalCollectionSchema` 自带一份 `inspection`。不要直接调用 `schemaInspector`，两个读取都走 registry，共用同一份命名索引。

### `collection.json`

`getResolution().collection` 加 `getResolution().warnings`。这是最终的逻辑 Collection 视图，由物理 Schema、补充元数据和连接命名配置合成：

```text
schema.json + metadata.json + connection naming = collection.json
```

它包含解析后的逻辑名、字段、字段逻辑类型、关系、命名信息，以及解析过程产生的警告。警告必须写入文件；一个解析不完整的 Collection 不能被静默地当作完整定义呈现。

它是派生文件。migration 不能引用它，任何工具也不能把它当作创建数据库表的指令。

### `metadata.json`

`connection.collectionMetadata.get(name)` 返回的存储文档写入 `document` 字段，即数据库里 `__nocobase_collection_metadata` 表中该 Collection 的补充元数据：标题、描述、字段标题、逻辑字段类型、枚举值、关系描述、乐观锁配置等。

第一阶段它是快照，不是编辑入口。要修改标题或描述，通过 Builder 的 `collection.title()` 之类的调用写进 migration，或者调用 Metadata Service，然后重新生成。对这个文件的手工编辑会在下次生成时被覆盖，`--check` 也会把手工编辑报告为过期。

没有补充元数据的 Collection 也写入这个文件，`document` 为 `null`，而不是省略文件。存储层的 `revision` 不写入：它随每次写入变化，不属于内容。三个文件始终同时存在，读者不需要处理"文件可能不在"的情况。

### `schema.json`

`getPhysical()` 返回的 `PhysicalCollectionSchema`：物理表标识、列、数据库类型、可空性、默认值、索引、约束，以及内嵌的 `inspection`，即检查过程中各方面的完整度状态和警告。

它由指定连接生成，内容是方言相关的：物理类型名、默认值的表示、自动生成的索引名都随方言变化。它不是 migration，也不能替代 migration 历史。

### `_manifest.json`

每个连接一份，记录这批文件对应的数据库状态和格式：

- `formatVersion`：文件格式版本，见下文。
- `connection`：连接名。
- `dialect`：生成时连接的方言标识。
- `schemaManagement`：`managed` 或 `external`。
- `migrationHead`：生成时该连接已执行的最后一个 migration 名称；没有 migration 表的连接为 `null`。
- `collections`：按名称排序的 Collection 名列表。

不记录生成时间戳、主机名或生成者。这些字段在每次生成时都会变化，会让确定性 diff 失效。

### 格式版本

每个文件顶层带 `formatVersion` 字段，第一版为 `1`。`CollectionDefinition` 和 `PhysicalSchemaInspection` 的类型仍在演进，`packages/libs/db/docs/zh-CN/proposals/` 下有多个字段类型提案会改变它们的形状。没有版本字段，旧文件在类型变更后无法被识别和迁移。

## 生成命令

```bash
pnpm nocobase app collections generate --connection main
pnpm nocobase app collections generate --all
```

命令形态与 `app migrate`、`app seed` 一致。默认作用于默认连接；`--connection` 指定一个连接；`--all` 遍历全部连接。external 连接同样生成：它的 Schema 由别的系统拥有，但"不连库就能看到结构"恰恰是对它最有价值的事。external 连接没有 migration 表，`migrationHead` 记为 `null`，`_manifest.json` 的 `schemaManagement` 字段区分两种连接。

生成只读取已有数据库，不隐式执行 migrations 或 seeds。反方向同样不隐式：`app migrate` 成功后不会自动刷新这些文件。两个命令保持正交，开发流程是"migrate，然后 generate，然后提交"，遗漏由 `--check` 在 CI 里捕获。

通过 `connection.collections.scan()` 枚举 Collection。registry 把所有 `__nocobase_` 前缀的表视为 NocoBase 自己的记账表并跳过，包括 migration 和 seed 的历史表与锁表以及 Collection 元数据表，生成器不需要自己维护排除列表。实现这一步时发现原来只排除了元数据表，任何跑过 migration 的库上 `list()` 和 `scan()` 都会在第一张记账表上抛错，已在 `@nocobase/db` 修复。

### 确定性输出

重复生成同一状态的数据库必须得到字节相同的文件。规则：

- 对象键按名称排序。
- 只对无序集合排序：Collection 列表、警告列表、约束列表这类顺序无语义的数组。
- 保留有语义顺序的数组：字段顺序对应列顺序，索引和约束内部的列顺序决定其含义，关系字段的顺序是定义的一部分。这些数组按解析结果原样输出。
- 固定缩进和换行，文件末尾一个换行符。

### 原子性

每个 Collection 的三个文件先写入临时目录，完成后整体替换目标目录。命令中断不能留下三个文件不一致的目录。`_manifest.json` 在全部 Collection 目录写完之后最后写入。

### 删除

生成器拥有 `database/<connection>/collections/` 整个目录。数据库里已不存在的 Collection，其目录被删除。目录内出现生成器不认识的文件或子目录时，命令失败并列出它们，而不是静默删除或忽略；第一阶段三个文件都是派生的，目录里不应有别的东西。

唯一的例外是以 `.` 开头的条目：编辑器和操作系统会在任何目录留下 `.DS_Store` 之类的文件，生成器自己的暂存目录也用这个前缀。它们被忽略，不报告也不删除。

### `--check`

```bash
pnpm nocobase app collections generate --connection main --check
```

只读模式，供 CI 和提交前检查使用。它在内存中生成结果，与磁盘文件逐字节比较，把每个差异归为三类之一：`missing`（应有而无）、`stale`（内容不同）、`unexpected`（磁盘上多出来的，包括生成器不认识的条目）。有任何差异时返回非零退出码并列出，不修改任何文件。写入模式下 `unexpected` 中生成器不认识的条目会让命令失败，而属于已删除 Collection 的三个文件会被清理。

`--check` 必须连接数据库，且这个数据库应当已迁移到 head。它是判断文件是否过期的唯一手段；`_manifest.json` 的 `migrationHead` 只能帮助不连库的工具判断"这份快照对应哪个 migration 状态"，不能替代 `--check`。

## 所有权与版本控制

migrations 负责 Schema 演进，是不可变的历史记录。每个 migration 必须显式声明表和字段操作，不能引用本文的任何文件、运行时 Collection 定义或之后可能变化的 metadata 模块。这条规则已经写在各模板的 `AGENTS.md` 里，本文不改变它。

三个 Collection 文件和 `_manifest.json` 在第一阶段全部是派生文件，没有一个需要人工编辑。应用在两种提交策略中选一种，并用 `--check` 强制执行：

- **全部提交。** 工具和 AI 直接读仓库里的文件，不需要数据库。这是本文的目的所在，是推荐策略。
- **全部不提交。** 把目录加入 `.gitignore`，需要时本地或 CI 生成。适合团队内方言不统一、无法接受方言差异带来的 diff 的情况。

"只提交 metadata"在第一阶段没有意义，因为 metadata 也是派生的。它在"文件为源头"阶段才成为选项。

### 方言约束

选择全部提交的应用必须有一个规范方言。`schema.json` 完全是方言相关的，`collection.json` 里的字段类型解析也可能带方言痕迹。两个开发者分别用 SQLite 和 Postgres 生成，会在每次提交产生与业务无关的 diff。因此：

- 团队约定一个规范方言，通常是生产方言。
- CI 里的 `--check` 连接该方言的数据库，迁移到 head 之后执行。
- 用其他方言开发的成员不提交生成结果，或者在提交前用规范方言的数据库重新生成。

`_manifest.json` 的 `dialect` 字段让 `--check` 能在方言不一致时直接报错，而不是报告一堆看似内容差异的文件。

## 名称安全

逻辑 Collection 名称在 `@nocobase/db` 里的校验只要求非空且无首尾空白。作为目录名使用前，生成器要施加更严格的规则，违反时命令失败：

- 不含路径分隔符 `/` 和 `\`，不等于 `.` 或 `..`，不以 `.` 开头。
- 不含控制字符，不与文件系统保留名冲突。
- 不以 `_` 开头，该前缀保留给 `_manifest.json` 这类连接级文件。
- 同一连接内，仅大小写不同的两个名称视为冲突。macOS 和 Windows 的默认文件系统不区分大小写，`Articles` 和 `articles` 会落到同一个目录。

这些规则只约束目录名。数据库里的 Collection 名不因此改变，冲突的名称需要先在数据库层面解决。

## 实现边界

序列化放在 `@nocobase/db`。它拥有 `CollectionDefinition`、`PhysicalSchemaInspection` 和 `CollectionMetadataDocument` 的类型，格式版本应随这些类型一起演进；确定性排序规则里"哪些数组有语义顺序"也只有类型的所有者能判断。对外暴露的是一组纯函数：给定 `getResolution()` 的结果和元数据文档，返回三个文件的字符串内容。

生成命令的逻辑放在 `@nocobase/app-server` 的 database 模块，入口是 `generateAppCollectionsArtifact(config, options)`。它已经掌握连接列表、`configPaths` 和"受管 / external"的区分，负责遍历连接、枚举 Collection、调用序列化、写文件、执行 `--check` 比较。`migrationHead` 通过 `Migrator.history()` 读取，migration 表名沿用任务计划解析出的配置。它不是 `AppDatabaseTaskKind` 的第三种取值：migrations 和 seeds 是"对库执行"，生成是"从库读出"，方向相反，不共用任务计划。

应用模板只注册命令。按仓库的三模板同步规则，`cli/commands/collections-generate.ts` 要同时加到 default、examples、hub 三个模板，`.gitignore`、`AGENTS.md` 的目录表和 `README` 同步更新。examples 模板用它生成一份示例产物，让读者看到真实文件长什么样。

生成器只使用 `connection.collections` 和 `connection.collectionMetadata` 的公开 API，不重新实现 Schema 检查或 Collection 解析。

## 分阶段

**第一阶段：生成与检查。** 本文的全部内容。产物是只读快照，运行时不参与。

**第二阶段（可选）：文件为元数据源头。** 让 `metadata.json` 成为可编辑文件，运行时通过目录型 `CollectionMetadataStore` 读取它。`ModuleCollectionMetadataStore` 已实现 `put` 和 `delete`，可以作为起点。进入这一阶段前必须回答：migration 里 `collection.title()` 写入的元数据去哪里；`--check` 如何区分"人工编辑"和"过期"；生成器对 `metadata.json` 是只创建骨架还是完全不碰。这些问题在第一阶段不存在，所以先不引入。

**第三阶段（可选）：运行时快照。** 用 `schema.json` 预填 `CollectionRegistry` 的缓存，省掉冷启动的 catalog 查询。解析本身是同步纯函数，贵的只是物理检查，所以运行时只需要 `schema.json` 加元数据，`collection.json` 不参与。这需要 registry 增加一个快照选项并从连接配置透传，以及用 `migrationHead` 做的过期校验。它改变"物理 Schema 是 Collection 是否存在的唯一依据"这条不变量的表述，要连同 `packages/libs/db` 的文档一起改。

## 已考虑的替代方案

- **扁平后缀命名 `articles.collection.json`。** 三个文件一张表时，目录列表是三倍文件数，删除和改名要按前缀匹配三个文件。文件只有一两个时扁平更合适，三个是分界线。
- **`metadata.json` 从第一天起可编辑。** 与"生成器写入全部文件"直接冲突，且默认 metadata store 在数据库里，会形成两个没有同步方向的源头。推到第二阶段。
- **`schema.json` 改名 `physical.json`。** `schema` 在 `@nocobase/db` 里已经指数据库 namespace 和 `connection.schema` 适配器，代码里对应的词是 `physical`。本文保留 `schema.json`，因为对不熟悉这个包的读者它更直白；如果要改，第一版发布前是唯一的时机。
- **`app migrate` 成功后自动生成。** 缩短了文件过期的窗口，但把一个只读命令挂在一个写命令后面，失败时不好解释是哪一步失败。保持正交，靠 `--check` 兜底。
- **作为 `AppDatabaseTaskKind` 的第三种任务。** 任务计划的语义是按顺序对库执行，生成是读操作，硬塞进去会让 `--fresh`、`autoRun` 这些选项对它没有意义。

## 未决问题

- `collection.json` 里的字段类型在不同方言下是否完全一致，需要用 db-testkit 的多方言套件实际生成一次对比，才能确定"规范方言"约束是只针对 `schema.json` 还是两个文件都需要。
