# 审计插件设计

状态：**设计草案，尚未实现。**

## 设计原则

**默认自动审计。** 启用插件后，常见 Repository 操作和内置登录安全事件自动记录。

**按需定制。** 数据操作通过 `addRepositoryRule()` 配置，HTTP 请求通过 `addHttpRule()` 配置；审批理由等自定义审计使用 `record()`。仅扩展代码需要依赖审计插件。

**独立留痕。** 审计独立、尽力保存，存储失败只报告，不撤销业务；不把回滚或未确认的结果记为成功。

```text
启用审计插件
    ├─ 常见业务 → 默认规则 → 自动审计
    ├─ 数据操作定制 → addRepositoryRule() → 按规则审计
    ├─ HTTP 请求定制 → addHttpRule() → 按规则审计
    └─ 自定义操作 → record() → 记录审计
```

## 1. 公共入口

Server 从 `@nocobase/app-plugin-audit/server` 导入 `auditServiceToken`，通过当前 App 容器取得 `AuditService`。

| API | 用途 | 返回 |
| --- | --- | --- |
| `addRepositoryRule(rule)` | 初始化时添加或替换 Repository 审计规则 | `void` |
| `addHttpRule(rule)` | 初始化时添加或替换 HTTP 审计规则 | `void` |
| `record(input)` | 记录自定义操作的审计日志，例如审批、业务拒绝 | `Promise<{ eventId, operationId }>` |

规则在应用或业务插件已有 Provider 的 `boot()` 中注册一次；没有现成 Provider 时再新增。该阶段可取得审计 Service，接入见[使用手册](../README.md#启用订单状态变更审计)。

**需要补充的基础支持：** 当前 DB 缺少通用 Repository Hook，需要补齐操作事件、实际目标、按需快照，以及事务作用域传递和结束通知；审计插件新增统一 HTTP 中间件。认证采集通过配置扩展接入认证实例的创建过程，该接入能力也需补齐。

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
| 详情 | `metadata` | 插件填写来源、事务、任务、Workflow、发起人及脱敏、裁剪信息，默认 `{}` |
| 详情 | `data` | 业务按需提供的 JSON 对象，例如审批理由，默认 `{}` |

预置分类为 `data`（数据写入）、`access`（读取与 HTTP）、`security`（登录安全）、`administration`（审计管理）、`business`（业务事件）。这些是常用分类，不限制业务自定义；`category` 用于展示与筛选，不决定权限或可信身份。

`actor`、时间及关联信息不由业务填写；任务和 Workflow 的执行者、发起人及运行信息由入口适配提供，未知信息留空。

`actor`、`resourceKey`、`changes`、`metadata`、`data` 使用 JSON 保存，其余为标识、文本或时间字段。

`resourceKey` 支持单字段和复合主键，键值统一保存为字符串，例如 `{ id: '123' }`、`{ tenantId: 't1', orderNo: 'SO-001' }`。`record()` 接受字符串、安全整数或布尔值并规范化；大整数传字符串。历史组件使用同一规范化方式，直接查询时使用完整键对象的存储值。

### 字段变化

| 字段策略 | `changes` 保存内容 |
| --- | --- |
| `changes` | `{ field, kind: 'value', before, after }`；创建的前值、删除的后值为空 |
| `changedOnly` | `{ field, kind: 'changed' }`，只记发生变化 |
| `relations` | `{ field, kind: 'relation', added, removed }`，保存关联记录的完整键 |

精确数值按字符串保存。同一事务内的数据事件与业务事件通过 `metadata.transactionId` 关联。

详情裁剪预算默认 **64 KiB**。超出预算时先缩减 `data`，再缩减变化值和关系列表；保留事件主体及完整目标键，在 `metadata.truncation` 标明详情不完整。省略的前后值成组处理，不表示字段变成空值。

## 3. 规则与自定义审计

### 3.1 按场景注册规则

| API | 必填项 | 可选项 |
| --- | --- | --- |
| `addRepositoryRule()` | `key`、`collection`、`operation` | `changes`、`changedOnly`、`relations`、`redaction` |
| `addHttpRule()` | `key`、`method`、`path` | — |

匹配项支持精确名称、`*` 和数组。`operation` 使用 Repository 方法名，例如 `updateOne`、`update*`；HTTP 使用请求方法和路径。

插件内置默认规则，业务无需重复注册：

```ts
audit.addRepositoryRule({
  key: 'audit.repository.default',
  collection: '*',
  operation: '*',
});
```

默认记录受支持操作的摘要，字段详情按规则采集。普通 HTTP 仅在规则命中时记录，登录由内置认证接入记录。

### 3.2 规则合并与替换

两类规则使用同一 key 空间。

| 情况 | 行为 |
| --- | --- |
| 相同 key | 后定义整条替换先定义，包含脱敏配置；旧定义退出匹配 |
| 不同 key 命中同次 Repository 操作 | 三类字段列表分别取并集、去重，合并脱敏要求；同次操作不因规则数量重复生成事件 |
| 多条 HTTP 规则命中同一请求 | 合并命中信息，只生成一条请求摘要 |

省略字段列表或填写 `[]` 表示不增加该项采集。需要移除某条规则的采集项时，用相同 key 重新定义；其他 key 的规则仍生效。三类列表可以同时配置；合并后同一字段同时出现在 `changes` 与 `changedOnly` 中属于配置冲突。

内置规则先注册，业务扩展随后，应用覆盖最后调用。所有 Provider 完成 `boot()` 后规则固定，修改代码后重启生效。覆盖默认规则后，没有匹配规则的操作不采集。

### 3.3 记录自定义审计

调用 `record()` 时，只需填写动作、资源和需要补充的业务信息：

| 输入 | 约定 |
| --- | --- |
| `action`、`resource` | 必填动作与资源名 |
| `resourceKey` | 可选完整记录键 |
| `category`、`result` | 均可省略。`category` 默认 `business`，也可传自定义分类名；`result` 默认 `success`，取值为 `success`、`failure` 或 `denied` |
| `data` | 可选业务数据，由业务校验并先处理业务敏感内容；插件仍执行内置凭证保护 |
| `reasonCode` | 可选原因码，保存到 `metadata` |

身份及事务关联自动获取，无需传连接。事务内调用先暂存，提交后尝试独立保存；无事务时直接尝试保存。回执仅表示接收，不保证已入库；无效输入仍向调用方报错。

## 4. 敏感数据与脱敏

脱敏在保存前完成，不修改业务数据。以下示例分别说明三个入口如何处理敏感内容。

```text
自动采集 / record()
    → 生成事件（字段先按真实值判断变化）
    → 统一脱敏 → 详情裁剪 → 事务内暂存 / 独立保存
```

### 4.1 Repository：配置字段脱敏

在采集规则中配置 `redaction.fields`：

```ts
audit.addRepositoryRule({
  key: 'customers.audit',
  collection: 'customers',
  operation: '*',
  changes: ['phone', 'privateNote'],
  redaction: {
    fields: {
      phone: { keepStart: 3, keepEnd: 4 },
      privateNote: 'redact',
    },
  },
});
```

手机号 `13812341234` 遮蔽为 `138****1234`，备注前后值整体替换为 `[REDACTED]`。只需记录字段被修改时，使用 `changedOnly`，不采集原值。

| 配置 | 作用 |
| --- | --- |
| `redact` | 整体替换为 `[REDACTED]` |
| `{ keepStart, keepEnd }` | 保留字符串首尾，中间替换为 `****`；非字符串或长度不足时整体替换 |

脱敏只处理该规则命中操作中已采集的字段，不扩大采集范围。不同 key 的脱敏要求合并：`redact` 优先，否则首尾各取最小保留长度；省略配置不取消其他规则的保护。

### 4.2 HTTP：不采集敏感正文

```ts
audit.addHttpRule({
  key: 'orders.approve.http',
  method: 'POST',
  path: '/api/orders/*/approve',
});
```

只记录请求方法、命中路径规则、状态码等摘要，不采集请求体、响应体或凭证，因此不提供业务字段脱敏参数。需要补充业务结果时使用 `record()`，只传必要信息。

### 4.3 record：先处理自定义敏感内容

```ts
await audit.record({
  action: 'crm.customer.verify',
  resource: 'customers',
  resourceKey: { id: '123' },
  data: {
    phone: '138****1234', // 调用前已遮蔽的值，不传完整手机号。
    reason: '联系方式已核验',
  },
});
```

`record()` 不继承 Repository / HTTP 规则，也没有业务脱敏配置参数。插件自动保护已知凭证键；其他业务敏感值和自由文本由调用方先处理，不能把原值传入后假定已脱敏。处理示例见[使用手册](../README.md#敏感字段脱敏)。

三个入口均执行内置凭证保护，业务不能放宽。页面与导出只读取已保存的脱敏数据，`readValues` 不恢复原值；脱敏失败只保留安全摘要并报告，不回退明文。新规则不改写已有日志。

## 5. 自动采集

**采集器就是插件内部的自动记录逻辑：** 从数据操作、HTTP 请求或认证结果中取得信息，生成审计事件。

```text
数据操作 → DB Hook → Repository 规则 ──┐
HTTP 请求 → 中间件 → HTTP 规则 ────────┤
登录 / 登出 → 认证结果 ────────────────┤
自定义操作 → record() ─────────────────┘
                   ↓
             统一脱敏与裁剪
                   ↓
          按事务结果独立保存 → auditEvents
```

### 5.1 Repository

| 操作 | 默认记录 |
| --- | --- |
| `createOne/createMany`、`updateOne/updateMany`、`upsertOne`、`deleteOne/deleteMany` | 成功提交的数据操作，按实际目标生成记录级事件；零命中不生成变化事件 |
| `findOne/findMany`、`count/exists`、`aggregate/groupBy` | 一次实际读取的摘要，不复制结果集 |

Repository 提供以下 Hook；审计插件通过 Hookable 的 `hook()` 订阅，DB 在对应阶段用 `await callHook()` 等待监听器执行：

| Hook | 时机 |
| --- | --- |
| `repository:operation:before` | 操作前，确定采集范围及需要的前值 |
| `repository:operation:after` | 实际操作完成，事务可能尚未提交 |
| `repository:operation:error` | 操作失败，提供失败信息 |

业务沿用原有事务。成功变化和事务内业务事件在最外层提交后独立保存；回滚范围内的暂存事件舍弃，提交结果不明时不记成功。审计不参与提交控制。

实际目标和快照在操作期间取得，不依赖业务 `select`；批量操作分块采集和入库，不改为逐条执行业务写入。

读取在查询真正执行时记录，事务中的读取摘要在事务结束后独立保存。未消费的惰性查询不记录，中断的迭代标明未完成。审计内部访问、认证凭证表、快照及回读排除；默认不获取全行快照，无匹配规则时不采集详情。嵌套写入按真实受影响对象记录。

### 5.2 HTTP 与登录

统一中间件在业务路由前接入，建立请求上下文，记录匹配请求的方法、命中路径规则、状态码、耗时和请求标识。多条 HTTP 规则命中时合并命中信息，只生成一条摘要；不采集请求体、响应体或凭证。

登录成功、失败、拒绝及显式登出从认证结果生成。HTTP 状态表示请求结果，不代替业务审批结论；无具体目标键的请求按请求关联查看。

读取、HTTP 和认证事件按已发生的事实独立保存。业务需要记录失败或拒绝时，在事务结束后调用 `record()`。审计回调自行报告故障，不改变其他 Hook 的错误处理。

## 6. 记录历史

**记录历史是审计数据的记录级视图，不单独做历史插件。** 复用 `auditEvents`、现有采集规则与权限，不新增历史表、采集流程或 Service API；`AuditHistory` 通过 Registry 复制到 App 后定制。

```text
Repository 自动审计 / record()
              ↓
         auditEvents
              ├─ 全局审计：按时间、执行者、资源等筛选
              └─ 记录历史：按 resource + resourceKey 查询
                            → AuditHistory 展示
```

### 6.1 历史范围

按 `resource` 和完整、规范化的 `resourceKey` 匹配。默认展示该记录的数据写入事件，以及通过 `record()` 显式绑定的自定义操作（含失败、拒绝）；按插件记录的事件来源识别，不把 `category` 固定为 `business`。来源与目标筛选在 Server 分页前完成。

读取、HTTP 和登录摘要不默认混入记录历史，可在全局审计中关联查看；不因 `requestId` 或事务标识相同就纳入其他目标的事件。没有目标键的自定义事件也不归入某条记录。

| 历史内容 | 复用能力 |
| --- | --- |
| 谁在何时创建、修改或删除记录 | 默认操作摘要 |
| 哪些字段从什么变成什么 | Repository 规则的 `changes`，只展示操作发生时已采集的值 |
| 敏感字段是否被修改 | `changedOnly`；配置脱敏的前后值按已保存内容展示 |
| 关联项增加或移除 | `relations`，展示关联记录键，不自动汇总子记录的字段修改 |
| 审批理由、业务拒绝等操作 | `record()` 指定同一 `resource`、`resourceKey` |

### 6.2 展示与边界

历史组件遵循 Server 审计权限：`read` 查看摘要，`readValues` 查看已保存详情；能访问当前业务记录不代表能查看其历史。已脱敏、已裁剪和无权查看详情分别提示，`changedOnly` 仅显示“已修改”，不把缺失的前后值显示为空值。

字段详情按需采集，可能因故障缺失、脱敏、裁剪或保留期清理而不完整。空结果显示“暂无可见历史记录”，不推断从未修改；无权访问或查询失败另行提示。

首版仅追踪启用后受支持的操作，不补录过去的变更，不做存量全表快照、完整版本重建或恢复。展示历史不重复采集或保存事件，查询沿用审计内部访问排除规则。接入示例见[使用手册](../README.md#5-记录历史)。

## 7. 页面

提供审计列表、记录历史和只读规则 Settings。页面和历史组件通过 Registry 复制到 App 后定制。

```text
审计页面
|
+-- 审计列表 [导出]
|   筛选：时间 / 分类 / 结果 / 执行者 / 资源
|   列表：时间 / 执行者 / 动作 / 结果 / 目标记录
|   详情：字段变化 / 业务数据 / 关联信息
|         脱敏字段标记“已脱敏”；被裁剪时标记“详情不完整”
|
+-- 记录历史
|   当前业务记录的写入与自定义操作，复用同一份审计数据
|
+-- 规则 Settings（只读）
    规则：内置规则 / 扩展规则
    内容：key / 类型 / 来源 / 匹配范围 / 采集字段 / 脱敏策略
    预览：指定 Collection / operation 的采集与脱敏合并结果
```

查看与导出遵循审计权限。

## 8. 首版暂不实现

- 规则的界面编辑、数据库持久化管理，以及完整历史快照、版本重建、恢复和草稿发布。
- 非默认连接、无完整主键、原始 SQL、外部改库及触发器副作用的自动采集。
- 业务与审计的原子提交、消息队列、持久投递和自动补偿重试；进程崩溃、存储故障或资源限额可能导致日志缺失。
- 任意自定义 WebSocket 或任务入口的身份自动识别，以及跨外部系统的原子回滚。
- 自由文本的自动敏感信息识别、可逆脱敏及历史日志追溯脱敏。

审计有额外采集与写入开销。暂存总量、写入并发和等待时间设上限，超限报告日志缺失，不阻止业务。
