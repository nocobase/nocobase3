# 审计能力使用手册

**状态：首版实现使用说明。** 本文用“客户列表编辑联系电话并查看操作日志”串起接入过程。短代码省略外围类型与常规错误映射，可运行代码在 `packages/examples/app-plugin-audit-example`；模块职责和范围见[设计说明](proposals/README.md)。

## 1. 先看调用与结果

用户在客户列表把 C-1001 的号码改为 13900005678，点击保存。服务端完成业务更新后，调用本次执行的 Audit：

```ts
await audit.log({
  action: 'crm.customer.updated',
  target: { type: 'crm.customer', id: 'C-1001' },
  result: 'success',
  data: {
    changes: {
      phone: { before: '138****1234', after: '139****5678' },
    },
  },
});
```

客户更新一行，日志新增一行。用户获得保存成功结果；客户所属用户打开“操作日志”，看到执行者 ID、编辑客户和成功结果，详情是脱敏后的号码变化。audit.log 不修改客户，操作人由入口绑定，ID 和时间由库补充。

```mermaid
flowchart LR
  A[准备 Writer 并装配服务] --> B[入口取得本次 Audit]
  B --> C[完成客户更新]
  C --> D[构造审计内容并 log]
  D --> E[Writer 写入日志]
  E --> F[应用查询与展示]
```

## 2. 准备应用的存储与接入

目标 App 已有数据库、认证、授权及客户业务。客户表 `auditExampleCustomers` 包含 id、ownerId、name、phone 和启用乐观锁的 version；本例是单租户，后面的更新片段假定客户电话为 13800001234、版本为 7。示例按认证用户隔离客户与日志，ownerId 由服务端设置。示例首次启动创建 audit-example-member 权限集并赋予已认证用户；后续管理员修改不会被重置，页面与接口都检查对应业务权限。

使用插件路径时，App 提供 `@nocobase/audit`、`@nocobase/app-plugin-audit` 及所需宿主依赖。基础库导出 Audit 类型与 createAudit；插件 `./server` 导出默认插件和 auditServiceToken。业务服务可以只依赖 Audit 小接口，只有入口与装配代码需要认识插件。以下步骤按已有 App 增量添加，无需替换其数据库或认证初始化。

App migration 创建 `auditExampleOperations`，下列结构只是本例采用的映射，不是审计插件强制要求的固定表。应用可以改变列名、增加索引或换成外部存储。

| 字段                                 | 示例类型与用途                           |
| ------------------------------------ | ---------------------------------------- |
| id、schemaVersion                    | string 主键、integer；事件标识和协议版本 |
| appName、occurredAt                  | string、datetimeTz；应用和 UTC 时间      |
| actor、source                        | JSON；实际执行者和请求来源               |
| tenantId、initiator、operationId     | 可空 string、JSON、string；可选关联信息  |
| action、targetType、targetId、result | string；动作、目标及业务结果             |
| data                                 | JSON；业务选取并脱敏的内容               |

示例业务模块的 `server/writer.ts` 提供 `createCustomerAuditWriter`。db 是宿主的 DatabaseManager，所有字段都来自传入事件：

```ts
export function createCustomerAuditWriter(db) {
  return {
    async write(event) {
      await db.repository('auditExampleOperations').createOne({
        values: {
          ownerId: event.data.ownerId,
          id: event.id,
          schemaVersion: event.schemaVersion,
          appName: event.appName,
          occurredAt: event.occurredAt,
          actor: event.actor,
          source: event.source,
          tenantId: event.tenantId ?? null,
          initiator: event.initiator ?? null,
          operationId: event.operationId ?? null,
          action: event.action,
          targetType: event.target?.type ?? null,
          targetId: event.target?.id ?? null,
          result: event.result,
          data: event.data,
        },
      });
    },
  };
}
```

write 等待实际写入，错误直接传播。一次 log 已包含这次入库，调用方不再 create 一次。Writer 不寻找当前用户；它只映射已形成的事件。通用 Repository Writer 可以复用同样逻辑，业务仍需提供这份映射和目标 repository。

将插件 `./server` 默认导出加入现有 `server/plugins.ts`。应用在启动装配处提供 Writer，插件 Provider 负责注册唯一的 AppAudit。下面使用现有配置工厂承载 Writer 工厂；没有额外 enabled 开关或 process 配置前提：

```ts
// server/config/audit.ts
import { defineAppConfig } from '@nocobase/app-server/config';
import { databaseManagerToken } from '@nocobase/db';
import { createCustomerAuditWriter } from '@nocobase/app-plugin-audit-example/server';

export default defineAppConfig(() => ({
  createWriter: (services) => ({
    writer: createCustomerAuditWriter(services.resolve(databaseManagerToken)),
  }),
}));
```

将该 audit 工厂加入 `server/config/index.ts` 的现有 `defaultAppConfigs()`。插件 Provider 在启动时读取并调用 createWriter，准备共享输出实例；没有 Writer 就报告装配错误。业务请求只获取服务，不重复创建 Writer。工厂返回 `{ writer, dispose? }`；Provider 停止时拒绝新写入、等待在途写入，再执行一次 dispose。只关闭工厂自建资源，不关闭借用的宿主数据库。

明确不需要审计的应用可以在自己的业务装配处提供下列对象，复用相同客户服务。这是部署选择，不能用它捕获“服务未注册”或输出异常后静默兜底；客户模块无需自行检测插件是否安装。

```ts
import type { Audit } from '@nocobase/audit';

const noAudit: Audit = { async log() {} };
```

该部署的入口把 noAudit 作为 audit 参数传给服务；启用审计的部署则使用下一节的绑定对象。无需给审计插件另加 enabled 配置。

## 3. 在请求入口绑定 Audit

客户路由自行使用现有认证和授权中间件。session 是服务端已验证会话，requestId 在服务端生成；input 只包含已校验的 id、name、phone、version；示例创建请求只接收 name、phone。浏览器不能指定本次操作人。

```ts
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';

const appAudit = app.container.resolve(auditServiceToken);
const audit = appAudit.for({
  actor: { type: 'user', id: session.user.id },
  source: { type: 'http', requestId },
});
const customer = await customers.update(identity, input, audit);
return context.json({ data: customer });
```

appAudit 是应用级对象，audit 是本次请求的对象。for 不写入日志，也不执行客户业务。业务函数把 Audit 继续传给真正产生事实的位置，无需再次读取 session 或获得 HTTP context。

App 名称由插件从宿主补充。若应用有租户或业务关联号，在可信入口一并绑定 tenantId、operationId；这些信息不会自动替代业务数据范围检查。

一次请求里调用多个业务函数时，可以继续传递同一个 audit；每次 log 各自产生新的事件 ID 和时间。需要跨请求关联时，由业务在入口提供相同的 operationId。不要把请求 audit 写进客户 Service 的成员变量，否则共享 Service 的并发调用可能混用身份。

## 4. 更新完成后记录事实

CustomerService.update 接收 identity、input 和 audit，db 是业务服务注入的 DatabaseManager。业务授权和数据更新保持在客户模块，审计只放在已确认结果的位置：

```ts
await identity.require({
  resource: { type: 'audit-example.customer', id: input.id },
  action: 'update',
});
const change = await db.transaction(async (connection) => {
  const repo = connection.repository('auditExampleCustomers');
  const before = await repo.findOne({
    filter: { id: input.id, ownerId: identity.identity.principal.id },
    select: (s) => s.fields('id', 'phone', 'version'),
  });
  if (!before) throw new Error('Customer not found');
  if (before.version !== input.version) throw versionConflict();
  if (before.phone === input.phone) return { before, after: before };
  const updated = await repo.updateOne({
    filter: { id: input.id, ownerId: identity.identity.principal.id },
    values: { phone: input.phone },
    ifVersion: input.version,
    select: (s) => s.fields('id', 'phone', 'version'),
  });
  return { before, after: updated.record };
});

if (change.before.phone !== change.after.phone) {
  const event = {
    action: 'crm.customer.updated',
    target: { type: 'crm.customer', id: input.id },
    result: 'success',
    data: {
      ...phoneChange(change.before.phone, change.after.phone),
      ownerId: identity.identity.principal.id,
    },
  };
  await logAuditBestEffort(audit, event, reportAuditFailure);
}
return change.after;
```

上段仅展示 phone 的更新；实际服务同时处理 name，并使用 RepositoryError 表达版本冲突。phoneChange 是客户模块的普通函数，接收已验证的十一位号码，只构造需要记录的数据。它无需注册到审计插件：

```ts
function phoneChange(before, after) {
  const mask = (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return {
    changes: { phone: { before: mask(before), after: mask(after) } },
  };
}
```

先比较真实值，再生成脱敏内容。不同号码即使脱敏后相同，仍能记录一次真实变化。新增和删除可以直接记录目标与结果，不必为了使用 log 构造并不存在的前后值；多个调用点也可以复用自己的事件构造函数。

`logAuditBestEffort` 从插件 `./server` 导入，内部调用 log；失败时仅向 reportAuditFailure 传安全 code 和可选 eventId，并包含诊断函数自身的异常。它用于提交之后，避免把已成功的客户更新报为失败。普通 audit.log 仍抛错，且不会重试。

本例的客户服务拥有最外层事务。若它被改为外层事务的一部分，记录位置也必须移到外层确认提交之后；内层函数返回不等于客户已保存。若授权拒绝或版本冲突发生在事务之前或其中，不产生 updated 成功事件；确有失败审计要求时，在对应业务分支单独记录受控原因。

以 u-17 提交版本 7 的修改为例，客户电话更新、版本变为 8，路由返回更新后的客户。日志新增一条，核心内容如下；未展示的 id、时间、来源等字段仍按 Writer 保存：

```json
{
  "actor": { "type": "user", "id": "u-17" },
  "action": "crm.customer.updated",
  "targetType": "crm.customer",
  "targetId": "C-1001",
  "result": "success",
  "data": {
    "changes": {
      "phone": { "before": "138****1234", "after": "139****5678" }
    }
  }
}
```

## 5. 查询与界面展示

App 为客户页面提供日志读取接口，使用现有授权决定可见范围；审计插件不自动生成路由。删除客户时保留历史，日志读取不依赖客户行仍然存在。

| 路径（相对 App API）                            | 返回内容                                   |
| ----------------------------------------------- | ------------------------------------------ |
| GET `/audit-example/customers`                  | 当前用户的客户，最多 100 条                |
| POST `/audit-example/customers`                 | 新增结果                                   |
| PATCH / DELETE `/audit-example/customers/:id`   | 带 id、version 的更新 / 删除结果           |
| GET `/audit-example/operations?targetId=C-1001` | 当前用户该客户的最多 100 条日志，包含 data |
| POST `/audit-example/maintenance`               | 调度受权的客户更新 Job                     |

列表处理器检查 readLogs 权限，使用可信 ownerId 和宿主 appName 筛选。未传 targetId 时返回自己的最近日志；首版不提供分页和单独详情接口。

```ts
const records = await db.repository('auditExampleOperations').findMany({
  filter: {
    ownerId: identity.identity.principal.id,
    appName,
    targetType: 'crm.customer',
    targetId: customerId,
  },
  sort: (s) => [s.field('occurredAt').desc(), s.field('id').desc()],
  limit: 100,
});
return context.json({ data: records });
```

Examples App 已注册两个 Server 插件及客户示例 Client 插件。完成应用首次安装并登录后，打开 `<App 基路径>/audit-example`；填写客户名称和号码、创建、编辑，再点“操作日志”。页面使用宿主 useApiClient；保存后刷新客户与历史。删除客户后可点“全部日志”查看保留记录，未保存或取消不会调用后端。页面直接显示执行者 ID，不依赖额外用户目录查询。

只有前述编辑时，查询返回 updated 及创建事件；后续删除后时间倒序为 deleted、updated、created。数据里的号码已脱敏，客户列表仍显示业务原值。读取失败只提示加载失败，保留保存成功状态，不自动重试客户操作。

日志表保存事件事实，App 可另行对接用户目录或当时显示名快照；示例没有通用审计员角色，用户只能读取自己的客户历史。替换成跨用户审计视图时，必须显式定义其授权与范围。

## 6. 扩展到新增、删除和后台执行

| 场景               | 沿用方式                                                    |
| ------------------ | ----------------------------------------------------------- |
| 新增客户           | 创建确认后 log created，target.id 取创建结果                |
| 删除客户           | 删除确认后 log deleted，保留真实目标 ID                     |
| 编辑取消或号码未变 | 不产生 updated 成功事件                                     |
| 拒绝或业务失败     | 按覆盖要求在对应分支 log denied/failure，保留原业务结果     |
| WS 业务消息        | 以服务端连接身份绑定独立 Audit，再调用同一业务服务          |
| Job                | 以 worker 信息绑定 service 身份；用户发起者可另记 initiator |

新增客户必须在创建完成后取得真实 ID 再记录，不能用前端临时行 ID。删除客户时先保留必要的目标标识，确认删除后记录 deleted；不必保存整行数据。批量修改可以逐客户产生事件，也可以记录一条批次摘要，取决于查询用途；需要从单个客户查看时，逐目标记录并共享 operationId 更直接。插件不会根据 updateMany 自动补出这些事件。

后台 Job 也把本次 Audit 传给同一个业务服务。下面的 this.context 是 Job 实例取得的真实 jobId、attempt；appAudit 由任务所属 App 的 Provider 提供。任务处理器仍自行取得业务授权 identity，并校验 input。

```ts
const audit = appAudit.for({
  actor: { type: 'service', id: 'customer-maintenance' },
  initiator: { type: 'user', id: trustedOwnerId },
  source: {
    type: 'job',
    jobId: this.context.jobId,
    attempt: this.context.attempt,
  },
});
await customers.update(identity, input, audit);
```

执行后仍是客户更新和日志写入各一次，日志操作人变为 customer-maintenance，来源包含真实任务标识。需要保留发起用户时，由可信任务创建流程保存并在执行时还原 initiator；不要将任务参数中的任意 userId 直接写作执行者。提交后日志失败沿用第 4 节处理，不触发一次新的客户更新来“补日志”。

示例导出 createCustomerWebSocketHandler，由 Examples App 在 `/audit-example/ws` 组合到自己的 WS 边界；每条 JSON 消息与更新 HTTP 请求同形。握手验证会话和同源，每条消息重新验证会话，再执行同一权限检查。WS 接入仅适用于 App 自有的业务处理器：用当前有效身份、连接及消息标识调用 for，再把 audit 传给服务。绑定粒度是一次消息处理，不能把带首条消息标识的 Audit 缓存在整条连接上。这里不要求把现有实时订阅协议改成通用 CRUD 协议。

## 7. 替换 Writer 或独立使用 lib

更换输出时，只替换装配处提供的 Writer。业务构造事件的方式和 log 调用保持不变；文件、Logger 或外部服务的历史读取由应用另行对接。独立脚本可直接使用 lib，writer 为选定输出、trustedJobId 来自实际任务入口，客户更新已经完成：

```ts
import { createAudit } from '@nocobase/audit';

const audit = createAudit({
  context: () => ({
    appName: 'crm',
    actor: { type: 'service', id: 'customer-maintenance' },
    source: { type: 'job', jobId: trustedJobId, attempt: 1 },
  }),
  write: (event) => writer.write(event),
});
await audit.log(customerUpdatedEvent);
```

customerUpdatedEvent 与第 4 节的 event 结构相同，data 已由业务选择并脱敏。脚本自行管理 Writer 自有资源；App 中由 Provider 管理。

context 在 log 调用时同步读取。本例返回固定服务身份与当前任务来源；AppAudit.for 在插件内部也通过这个契约连接 lib，只是上下文已经复制、校验并绑定。write 收到的是完整事件，调用者随后修改 customerUpdatedEvent 不应影响正在输出的快照。

直接替换装配工厂即可改用 lib 的本地 JSONL Writer。auditFile 是部署指定的绝对路径，目录先由启动代码准备：

```ts
import { createJsonlAuditWriter } from '@nocobase/audit/writers/jsonl';

createWriter: () => ({ writer: createJsonlAuditWriter(auditFile) });
```

同一个 Writer 顺序追加一条一行的 JSON；一次失败不会阻止后续写入。完成点是 appendFile 完成，不承诺 fsync、跨进程排序或远端交付。切到文件后不再写 auditExampleOperations，原数据库页面不会读到新事件，需配套文件检索。

云存储使用 Drive Writer，直接复用应用 `server/config/drive.ts` 的存储盘；以下代码替换第 2 节的 audit 配置工厂：

```ts
import { defineAppConfig } from '@nocobase/app-server/config';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';
import { createDriveAuditWriter } from '@nocobase/audit/writers/drive';

export default defineAppConfig((): AuditConfig => ({
  createWriter: (services) => ({
    writer: createDriveAuditWriter({
      disk: services.resolve(driveManagerToken).use('s3'),
      prefix: 'audit',
    }),
  }),
}));
```

`s3` 必须是已配置的盘名，桶、凭据与 endpoint 仍在 Drive 配置中；也可选择 FS 盘。prefix 默认 audit；各相对路径段只含英文字母、数字、横线或下划线。宿主 Drive 不需要 dispose。

每条事件写入 `audit/<base64url应用名>/YYYY/MM/DD/<事件ID>.jsonl`，内容是完整事件加换行；完成点是 put 确认。对象存储不支持通用追加，不能将同一个日志对象反复读取、修改并覆盖。此方案没有 Writer 缓冲或重试，驱动自身可能重试；一条事件一次对象写入，小对象成本需按业务量评估，首版不做批量合并。Writer 请求 private，关闭 ACL 时仍由桶策略保证私有；FS 盘须配置 private 并避开公开静态目录，当前驱动不按单次写入调整文件权限。切换后应在目标盘读取 JSONL 核对事件，数据库页面不会自动读取云端对象。

## 8. 交付时确认记录覆盖

Agent 开始接入前，应从客户新增、编辑、删除入口追踪到真正完成业务的位置，确定每个事实的 action、目标和允许记录的字段。已有公共服务被 HTTP 与 Job 共同调用时，把记录放在共同的事实完成点，入口只绑定来源，避免路由和服务各写一条重复事件。

完成后用一次保存和一次日志查询核对同一客户、同一执行者及具体脱敏内容；同时检查取消、无变化和业务失败没有误记成功。后台路径还需要核对 service 身份、发起者和任务标识，不能只验证 HTTP。替换 Writer 时确认事件语义不变、结果出现在新的目的地。

## 首版不实现

- Workflow 适配：首版不修改 Workflow 执行器或执行选项，不交付相关接入帮助与示例。
- 自动采集规则：不提供 addRepositoryRule/addHttpRule，也不自动审计所有表和请求。
- 全局执行设施：不要求 runtime.run，不通过 ALS 自动找到当前 Audit。
- 强制数据模型：不要求统一审计表、历史表或独立数据历史插件。
- 通用日志管理产品：不生成统一查询 API、管理页面、版本比较或恢复。
- 额外处理语言：不要求事件注册 DSL、必填 process 或字段规则配置。
- 强可靠性扩展：不提供自动补偿、发件箱或防篡改保证；提交后输出仍可能漏记。
- 外部框架运行时：不要求安装 CAP 等框架才能使用审计。

源码测试覆盖独立事件/Writer、Provider 生命周期、真实 SQLite 与登录会话的 HTTP/Job/WS 路径、客户页交互及审计失败后的业务结果。集成到其他 App 后仍应复验该 App 的业务授权、字段选择与输出目的地。
