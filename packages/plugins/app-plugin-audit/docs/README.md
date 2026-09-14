# 审计插件使用手册

状态：**设计草案，尚未实现。** 本文描述拟议接入方式，设计范围见[方案说明](./proposals/README.md)。

默认自动记录数据操作；`addRepositoryRule()` 定制数据操作审计，`addHttpRule()` 定制 HTTP 请求审计，`record()` 记录自定义操作。审计独立保存，存储失败只报告，不撤销业务。

## 使用前准备

将审计插件的 Server 默认定义和 Client 默认工厂加入现有插件列表，放在依赖它的业务插件之前。

示例使用默认连接 `main`、已有的订单业务与授权。订单 `123`、`124`、`125` 均为 `pending`，分别用于下面三个场景；`container` 为当前 App 容器。

## 1. 自动审计与记录历史

### 配置订单字段

普通业务使用默认摘要时无需添加规则。需要记录订单状态变化时，在业务插件的 Provider 中配置：

```ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';

export class OrdersAuditProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = 'orders-audit';

  public override boot(): void {
    const audit = this.app.container.resolve(auditServiceToken);
    audit.addRepositoryRule({
      key: 'orders.status',
      collection: 'orders',
      operation: 'updateOne',
      changes: ['status'],
    });
  }
}
```

将 `OrdersAuditProvider` 加入业务插件的 `serviceProviders`。应用级覆盖在业务规则之后注册。两个规则 API 均无需传 `type`；共用 key 空间，相同 key 的后定义整条替换先定义。

### 更新订单

```ts
import { databaseManagerToken } from '@nocobase/db';

const db = container.resolve(databaseManagerToken);
const { record: order } = await db.repository('orders').updateOne({
  filter: { id: 123 },
  values: { status: 'approved' },
});
```

**预期结果：**订单提交后，独立尝试保存一条记录级事件，目标为 `orders`、`{ id: '123' }`，变化为 `status: pending → approved`。默认规则与 `orders.status` 同时命中不重复采集。

### 查看同一订单的历史

```ts
const history = await db.repository('auditEvents').findMany({
  filter: (f) =>
    f.and([
      f.string('resource').eq('orders'),
      f.json('resourceKey').eq({ id: String(order.id) }),
    ]),
  limit: 20,
});
```

**预期结果：**审计保存成功时可查到事件；没有记录不代表业务失败。数字键按字符串查询，复合键传完整对象，例如 `{ tenantId: 't1', orderNo: 'SO-001' }`。

浏览器使用 `api.repository('auditEvents')` 和同一查询条件，经 Server 授权返回；只有摘要权限时隐藏前后值。可信 Server 的原生查询由调用方控制访问。

## 2. 扩展采集规则

以下规则同样在初始化阶段注册，修改后重启生效。

### 合并字段与关系

用不同 key 补充订单规则，字段列表会与已有规则合并：

```ts
const audit = container.resolve(auditServiceToken);

audit.addRepositoryRule({
  key: 'orders.detail',
  collection: 'orders',
  operation: 'updateOne',
  changes: ['total'],
  changedOnly: ['internalNote'],
  relations: ['items'],
});
```

**预期结果：**与 `orders.status` 合并后，保存 `status`、`total` 的前后值，并增加 `internalNote` 变化标记和 `items` 关系增减。同一字段去重，同次更新不因规则数量增加而重复记录。示例字段与关系必须存在。

匹配多个 Collection 可使用 `'sales*'` 或名称数组；`operation: ['update*', 'upsertOne']` 匹配更新及 upsert。

| 目的 | 做法 |
| --- | --- |
| 补充采集内容 | 用不同 key 注册；各字段列表合并、去重 |
| 整条替换某条规则 | 用相同 key 注册完整新定义，连同脱敏配置一起替换 |
| 移除某条规则的采集项 | 用相同 key 重新定义，省略该项或设为 `[]`；其他规则的采集项不受影响 |

例如，将 `orders.detail` 替换为只采集 `status`，其原来的 `total`、`internalNote` 和 `items` 策略退出。`orders.status` 仍生效，合并后的 `status` 只记录一次。同一字段不能同时要求保存值和只记变化。

### 调整默认范围

在初始化代码中覆盖内置 key：

```ts
audit.addRepositoryRule({
  key: 'audit.repository.default',
  collection: '*',
  operation: [
    'createOne', 'createMany', 'updateOne', 'updateMany',
    'upsertOne', 'deleteOne', 'deleteMany',
  ],
});
```

**预期结果：**旧默认规则退出匹配，仅由默认规则覆盖的读取不再采集。其他 key 仍生效；某条业务规则使用 `operation: '*'` 时，其匹配的读取仍会记录。

默认读取摘要也会增加审计写入；高频读取可按上例缩小范围。默认摘要不代表零额外 SQL，批量写入也仍按目标记录生成事件；独立保存可能增加调用耗时，不承诺性能不变。

### 敏感字段脱敏

在 Repository 规则中同时声明采集内容与脱敏要求，不需要另写 App 脱敏配置。以下示例假定已有 `customers` Collection：

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

`redaction.fields` 按字段名精确匹配已采集的前后值，不增加采集字段。Collection 和操作范围沿用外层规则：只匹配 `updateOne` 的规则，不会保护其他操作。多条规则命中时先合并采集与脱敏要求，再处理最终事件；省略 `redaction` 不会取消其他规则的保护。

| 示例 | 预期保存内容 |
| --- | --- |
| `customers.phone` 为 `13812341234` | 保存 `138****1234`，不保存完整手机号 |
| `customers.privateNote` 配置在 `changes` 中 | 保留变化条目，前后值整体替换为 `[REDACTED]`；仅需变化标记时改用 `changedOnly` |
| `record()` 的 `data.contact.phone` | 不继承该规则，需调用方先遮蔽，不能直接传入原值并假定已保护 |

`{ keepStart, keepEnd }` 仅处理字符串，非字符串或长度不足时整体替换；两项必须为非负整数。重叠配置以 `redact` 为先，否则首尾各取最小保留长度。凭证保护优先于业务配置，内置键名及范围见[设计第 4 节](./proposals/README.md#4-敏感数据与脱敏)。

脱敏前已确认的变化始终保留，遮蔽后显示相同不代表未修改。`metadata.redaction` 标明处理位置；页面和导出都无法恢复原值，`readValues` 只授权已保存的详情。自由文本、敏感主键或未配置的业务字段不会自动匿名化；`record().data` 仅自动执行内置凭证保护，其他敏感内容由调用方先处理。脱敏失败只保留安全摘要，不保存原文。新配置不改写已有日志。

### HTTP 摘要

```ts
audit.addHttpRule({
  key: 'orders.approve.http',
  method: 'POST',
  path: '/api/orders/*/approve',
});
```

规则作用于已有路由，记录请求摘要，不代表审批成功，也不推断订单键。通过 `requestId` 关联同一请求中的事件。多条 HTTP 规则命中时合并命中信息，只生成一条请求摘要。HTTP 规则不采集请求体、响应体，也不配置业务字段脱敏。

## 3. 记录审批结果

状态变化自动记录，审批理由用 `record()` 补充。`category` 默认 `business`，也可直接填写 `sales` 等自定义名称，无需注册；`result` 默认 `success`，身份与时间自动填写。

下面的函数供 HTTP 和 Workflow 复用。事务关联由 DB 执行上下文提供，`record()` 不传连接：

```ts
// server/workflows/order-approval/server/order-service.ts
import type { ServiceResolver } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';

export async function approveOrder(
  services: ServiceResolver,
  orderId: number,
  reason: string,
): Promise<{ eventId: string; operationId: string }> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !reason.trim()) {
    throw new Error('订单标识和审批理由无效');
  }
  const db = services.resolve(databaseManagerToken);
  const audit = services.resolve(auditServiceToken);

  return db.transaction(async (connection) => {
    await connection.repository('orders').updateOne({
      filter: { id: orderId, status: 'pending' },
      values: { status: 'approved' },
    });
    return audit.record({
      action: 'sales.order.approve',
      resource: 'orders',
      resourceKey: { id: orderId },
      data: { reason: reason.trim() },
    });
  });
}
```

调用后查看业务事件：

```ts
const approval = await approveOrder(container, 124, '预算已确认');
const event = await db.repository('auditEvents').findOne({
  filter: { id: approval.eventId },
});
```

**预期结果：**订单提交后，两条事件分别独立保存，通过 `metadata.transactionId` 关联。保存成功时可按 `eventId` 查到业务事件；回执只表示接收，不保证记录存在，缺少日志也不回滚订单。

拒绝审批而不修改订单时，独立记录：

```ts
await audit.record({
  action: 'sales.order.approve',
  resource: 'orders',
  resourceKey: { id: 124 },
  result: 'denied',
  reasonCode: 'ORDER_APPROVAL_DENIED',
  data: { reason: '当前用户无审批权限' },
});
```

此调用独立记录已确认的拒绝结果，不代替业务权限检查。失败尝试在业务事务结束后记录；无效输入仍报错，存储故障只报告。

## 4. 在 Workflow 中复用

沿用上一章的审批函数，不增加审计专用节点：

```text
server/workflows/order-approval/
├── workflow.ts
└── server/
    ├── order-service.ts
    └── approve.ts
```

工作流定义：

```ts
// server/workflows/order-approval/workflow.ts
import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: '订单审批',
  inputSchema: {
    type: 'object',
    required: ['orderId', 'reason'],
    properties: {
      orderId: { type: 'integer', minimum: 1 },
      reason: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'approveOrder',
      title: '审批订单并记录理由',
      config: {
        module: './server/approve',
        args: {
          orderId: '{{$input.orderId}}',
          reason: '{{$input.reason}}',
        },
      },
    }),
  ],
});

export default workflow;
```

Run 模块：

```ts
// server/workflows/order-approval/server/approve.ts
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { approveOrder } from './order-service.js';

export async function run(
  args: unknown,
  options: WorkflowRunOptions,
): Promise<{ eventId: string; operationId: string }> {
  if (
    typeof args !== 'object' || args === null ||
    !('orderId' in args) || typeof args.orderId !== 'number' ||
    !('reason' in args) || typeof args.reason !== 'string'
  ) {
    throw new Error('订单审批参数无效');
  }
  options.signal.throwIfAborted();
  return approveOrder(options.services, args.orderId, args.reason);
}
```

发布并启用工作流后，由已有业务入口触发：

```ts
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';

const workflow = container.resolve(workflowServiceToken);
const receipt = await workflow.trigger(
  'order-approval',
  { orderId: 125, reason: '预算已确认' },
  { eventKey: 'order-approval:125:1' },
);

if (receipt.status === 'skipped') {
  throw new Error(`订单审批流程未受理：${receipt.reason}`);
}
```

**预期结果：**`accepted` 只表示受理。Run 成功表示订单审批完成；审计在事务提交后独立保存，节点结果中的 `eventId` 用于关联。执行者、发起人和运行信息由 Workflow 入口提供。

触发重试复用 `eventKey`；新的业务事件使用新 key。节点恢复仍需处理“已审批”状态，超时或取消不撤销已提交结果。

## 5. 查看与可选设置

审计列表查看已授权历史；订单详情使用 Registry 安装到 App 的本地组件：

```tsx
import { AuditHistory } from '../extensions/nocobase-audit-history-ui';

export function OrderHistory({ orderId }: { orderId: number }) {
  return <AuditHistory resource="orders" resourceKey={{ id: orderId }} />;
}
```

路径按实际安装目录调整。组件负责规范化记录键，通过 Server 查询历史。规则 Settings 只读展示内置规则、扩展规则和最终合并结果；选择 Collection 与 operation 即可检查采集字段和脱敏策略。

权限使用 `audit.resource`，订单资源标识为 `main.orders`：`read` 查看摘要，额外的 `readValues` 查看历史值、关系键和 `data`；导出还需 `export`。隐藏的详情不参与筛选或排序。规则页需审计设置访问权限。

导出入口为 `POST /api/auditEvents:export`，每次最多 1000 条，沿用查询与分页协议，返回 `{ data: { records, exportedCount, operationId } }`。数据准备完成后尝试独立记录导出事件，审计保存失败不阻止返回结果。

可选 App 配置：

```yaml
# config.yml；修改后重启生效。
audit:
  retentionDays: 180
  maxEventBytes: 65536
```

`retentionDays` 默认 `null`，不清理历史；设为正整数后，每天按 500 条分批清理。`maxEventBytes` 默认 65536，是详情裁剪预算，不是拒绝保存的上限；保留事件主体，页面标明“详情不完整”，与权限隐藏区分。

导出与启动时采用的保留配置记录为 `administration` 事件，资源为 `audit`，通过 `main.audit` 授权；启动事件使用 system 身份。
