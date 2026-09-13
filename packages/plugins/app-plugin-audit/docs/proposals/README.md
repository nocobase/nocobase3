# 审计插件设计

状态：**设计草案，尚未实现。**

## 设计原则

**默认自动审计。** 启用插件后，常见 Repository 操作和内置登录安全事件自动记录。

**按需定制。** 特殊审计需求通过 `auditService.addRule()` 配置；业务需要额外记录审批理由等信息时，使用 `record()`。仅扩展代码需要依赖审计插件。

```text
启用审计插件
    ├─ 常见业务 → 默认规则 → 自动审计
    └─ 定制需求 → addRule() → 按规则审计
```

## 1. 公共入口

Server 从 `@nocobase/app-plugin-audit/server` 导入 `auditServiceToken`，通过当前 App 容器取得 `AuditService`。

| API | 用途 | 返回 |
| --- | --- | --- |
| `addRule(rule)` | 初始化时添加或替换 Repository、HTTP 审计规则 | `void` |
| `record(input, { connection }?)` | 记录业务事件，可传入默认库事务连接 | `Promise<{ eventId, operationId }>` |

**需要补充的基础支持：** 当前 DB 缺少通用 Repository Hook，需要补齐操作事件、实际目标、按需快照和事务提交保护；审计插件新增统一 HTTP 中间件。认证采集通过配置扩展接入认证实例的创建过程，该接入能力也需补齐。

## 2. 审计数据表

`auditEvents` 位于当前 App 的默认连接，每行保存一条事件。业务记录或用户删除不影响已有历史。

| 分组 | 字段 | 内容与填写方式 |
| --- | --- | --- |
| 事件 | `id` | 服务端生成的事件主键 |
| 事件 | `occurredAt` | 服务端填写 UTC 发生时间 |
| 事件 | `category` | 事件分类。自动事件按来源填写；`record()` 默认 `business`，允许自定义分类名，无需注册 |
| 事件 | `action` | 动作名称；自动事件由插件生成，业务事件自定义，如 `sales.order.approve` |
| 事件 | `result` | `success`、`failure` 或 `denied`；自动事件根据执行结果填写，`record()` 默认 `success` |
| 主体与目标 | `actor` | 服务端填写执行者的类型与标识；未认证请求使用 `anonymous` 类型，其他无法识别的执行者为空 |
| 主体与目标 | `resource` | 自动事件使用 Collection 名或对应逻辑资源；业务事件由调用方指定 |
| 主体与目标 | `resourceKey` | 完整记录键；自动提取，业务事件按需提供，无具体记录时为空 |
| 关联 | `requestId` | 服务端填写请求标识，无请求时为空 |
| 关联 | `operationId` | 服务端生成操作标识；同次批量操作的事件共享此值 |
| 详情 | `changes` | 按规则生成字段变化与关系增减，默认 `[]` |
| 详情 | `metadata` | 插件填写来源、事务、任务、Workflow、发起人及裁剪信息，默认 `{}` |
| 详情 | `data` | 业务按需提供的 JSON 对象，例如审批理由，默认 `{}` |

预置分类为 `data`（数据写入）、`access`（读取与 HTTP）、`security`（登录安全）、`administration`（审计管理）、`business`（业务事件）。这些是常用分类，不限制业务自定义；`category` 用于展示与筛选，不决定权限或可信身份。

`actor`、时间及关联信息不由业务填写；任务和 Workflow 的执行者、发起人及运行信息由入口适配提供，未知信息留空。

`actor`、`resourceKey`、`changes`、`metadata`、`data` 使用 JSON 保存，其余为标识、文本或时间字段。

### 记录键与变化

`resourceKey` 支持单字段和复合主键，键值统一保存为字符串，例如 `{ id: '123' }`、`{ tenantId: 't1', orderNo: 'SO-001' }`。`record()` 接受字符串、安全整数或布尔值并规范化；大整数传字符串。历史组件使用同一规范化方式，直接查询时使用完整键对象的存储值。

| 字段策略 | `changes` 保存内容 |
| --- | --- |
| `changes` | `{ field, kind: 'value', before, after }`；创建的前值、删除的后值为空 |
| `changedOnly` | `{ field, kind: 'changed' }`，只记发生变化 |
| `relations` | `{ field, kind: 'relation', added, removed }`，保存关联记录的完整键 |

精确数值按字符串保存。同一事务内的数据事件与业务事件通过 `metadata.transactionId` 关联。

详情裁剪预算默认 **64 KiB**。超出预算时先缩减 `data`，再缩减变化值和关系列表；保留事件主体及完整目标键，在 `metadata.truncation` 标明详情不完整。省略的前后值成组处理，不表示字段变成空值。

## 3. 规则与业务事件

### 3.1 两类规则

| 类型 | 必填项 | 可选项 |
| --- | --- | --- |
| 共同 | `key`、`type` | — |
| `repository` | `collection`、`operation` | `changes`、`changedOnly`、`relations` |
| `http` | `method`、`path` | — |

匹配项支持精确名称、`*` 和数组。`operation` 使用 Repository 方法名，例如 `updateOne`、`update*`；HTTP 使用请求方法和路径。

内置默认规则：

```ts
const defaultRule = {
  key: 'audit.repository.default',
  type: 'repository',
  collection: '*',
  operation: '*',
};
```

默认记录受支持操作的摘要，字段详情按规则采集。普通 HTTP 仅在规则命中时记录，登录由内置认证接入记录。

### 3.2 规则合并与替换

| 情况 | 行为 |
| --- | --- |
| 相同 key | 后定义整条替换先定义，旧定义退出匹配 |
| 不同 key 同时命中 | 合并采集需求：三类字段列表分别取并集、去重；同次操作不重复生成事件 |

省略字段列表或填写 `[]` 表示不增加该项采集。需要移除某条规则的采集项时，用相同 key 重新定义；其他 key 的规则仍生效。合并后同一字段同时出现在 `changes` 与 `changedOnly` 中属于配置冲突。

内置规则先注册，业务扩展随后，应用覆盖最后调用。规则初始化后固定，修改代码后重启生效。覆盖默认规则后，没有匹配规则的操作不采集。

### 3.3 记录业务事件

调用 `record()` 时，只需填写动作、资源和需要补充的业务信息：

| 输入 | 约定 |
| --- | --- |
| `action`、`resource` | 必填动作与资源名 |
| `resourceKey` | 可选完整记录键 |
| `category`、`result` | 均可省略。`category` 默认 `business`，也可传自定义分类名；`result` 默认 `success`，取值为 `success`、`failure` 或 `denied` |
| `data` | 可选业务数据，由业务校验并去除敏感内容 |
| `reasonCode` | 可选原因码，保存到 `metadata` |

不传事务连接时独立保存，失败向调用方报错；传入连接时与业务共同提交或回滚。审批的数据变化与审批理由可以分别记录，身份信息自动填入。

## 4. 自动采集

**采集器就是插件内部的自动记录逻辑：** 从数据操作、HTTP 请求或认证结果中取得信息，生成审计事件。

```text
数据操作 → DB Hook → Repository 规则 → auditEvents
HTTP 请求 → 中间件 → HTTP 规则 → auditEvents
登录 / 登出 → 认证结果 → auditEvents
业务补充 → record() → auditEvents
```

### 4.1 Repository

| 操作 | 默认记录 |
| --- | --- |
| `createOne/createMany`、`updateOne/updateMany`、`upsertOne`、`deleteOne/deleteMany` | 成功提交的数据操作，按实际目标生成记录级事件；零命中不生成变化事件 |
| `findOne/findMany`、`count/exists`、`aggregate/groupBy` | 一次实际读取的摘要，不复制结果集 |

Repository 提供以下 Hook；审计插件通过 Hookable 的 `hook()` 订阅，DB 在对应阶段用 `await callHook()` 等待监听器执行：

| Hook | 时机 |
| --- | --- |
| `repository:operation:before` | 操作前，确定采集范围及需要的前值 |
| `repository:operation:after` | 操作完成，写操作尚未提交事务 |
| `repository:operation:error` | 操作失败，提供失败信息 |

写入与审计共用事务；审计保存失败时业务一并回滚。实际目标和快照由 DB 提供，不依赖业务 `select`；批量操作分块采集和入库，不改为逐条执行业务写入。

读取在查询真正执行时记录，事务中的读取摘要在事务结束后独立保存。未消费的惰性查询不记录，中断的迭代标明未完成。审计内部访问、认证凭证表、快照及回读排除；默认不获取全行快照，无匹配规则时不采集详情。嵌套写入按真实受影响对象记录。

### 4.2 HTTP 与登录

统一中间件在业务路由前接入，建立请求上下文，记录匹配请求的方法、命中路径规则、状态码、耗时和请求标识。多条 HTTP 规则命中时合并命中信息，只生成一条摘要；不默认记录请求体、响应体或凭证。

登录成功、失败、拒绝及显式登出从认证结果生成。HTTP 状态表示请求结果，不代替业务审批结论；无具体目标键的请求按请求关联查看。

读取、HTTP 和认证记录保存失败时报告错误，不改变已确定的原结果。业务需要保留失败尝试时，在事务结束后独立调用 `record()`。

## 5. 页面

提供审计列表、记录历史和只读规则 Settings。页面和历史组件通过 Registry 复制到 App 后定制。

```text
审计页面
|
+-- 审计列表 [导出]
|   筛选：时间 / 分类 / 结果 / 执行者 / 资源
|   列表：时间 / 执行者 / 动作 / 结果 / 目标记录
|   详情：字段变化 / 业务数据 / 关联信息
|         被裁剪时标记“详情不完整”
|
+-- 记录历史
|   当前业务记录的事件列表与字段变化
|
+-- 规则 Settings（只读）
    规则：内置规则 / 扩展规则
    内容：key / 类型 / 来源 / 匹配范围 / 采集字段
    预览：指定 Collection / operation 的实际合并结果
```

查看与导出遵循审计权限。

## 6. 首版暂不实现

- 规则的界面编辑、数据库持久化管理，以及历史恢复。
- 非默认连接、无完整主键、原始 SQL、外部改库及触发器副作用的自动采集。
- 独立留痕的持久投递、自动补偿重试；进程崩溃仍可能丢失待写事件。
- 任意自定义 WebSocket 或任务入口的身份自动识别，以及跨外部系统的原子回滚。
