# 审计插件使用手册

状态：**设计草案，尚未实现。** 本文描述拟议接入方式，设计范围见[方案说明](./proposals/README.md)。

默认自动记录数据操作；`addRepositoryRule()` 定制数据操作审计，`addHttpRule()` 定制 HTTP 请求审计，`record()` 记录自定义操作。审计独立保存，存储失败只报告，不撤销业务。

## 使用前准备

将审计插件的 Server 默认定义和 Client 默认工厂加入现有插件列表，放在依赖它的业务插件之前。

示例使用默认连接 `main`、已有的订单业务与授权。订单 `123`、`124`、`125` 均为 `pending`，分别用于下面三个场景；`container` 为当前 App 容器。

## 1. 自动审计

### 启用订单状态变更审计

默认审计只记录操作摘要。需要保存订单状态的前后值时，在应用或业务插件已有 Provider 的 `boot()` 中注册规则。规则在初始化时注册一次，无需在每次业务操作中重复添加；没有现成 Provider 时再新增。

```ts
// server/providers/orders.ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';

export class OrdersProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'orders';

  public override boot(): Promise<void> {
    const audit = this.app.container.resolve(auditServiceToken);
    audit.addRepositoryRule({
      key: 'orders.status',
      collection: 'orders',
      operation: 'updateOne',
      changes: ['status'],
    });
    return Promise.resolve();
  }
}
```

已有 Provider 时，只合入规则调用并保留原有初始化逻辑，不重复注册 Provider。新增时，将其加入业务插件已有的 `serviceProviders`；直接在 App 编写业务则加入 `server/providers/index.ts` 的导出列表。应用级覆盖在业务规则之后注册；相同 key 的后定义整条替换先定义。

本例只追踪 `updateOne`；需要覆盖批量更新或 upsert 时，将 `operation` 改为 `['updateOne', 'updateMany', 'upsertOne']`。规则只配置审计，不创建或修改订单字段。

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

查看该订单的事件与字段变化，见[记录历史](#5-记录历史)。

## 2. 扩展采集规则

以下规则同样在已有 Provider 的 `boot()` 中注册，修改后重启生效。

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

### 敏感字段脱敏

| 入口 | 业务敏感内容如何处理 |
| --- | --- |
| `addRepositoryRule()` | 用 `redaction.fields` 配置字段前后值的遮蔽 |
| `addHttpRule()` | 只采请求摘要，不采请求体、响应体或凭证，无业务字段脱敏参数 |
| `record()` | 调用前处理业务敏感值；不继承采集规则，仅自动执行内置凭证保护 |

#### Repository：采集与脱敏一起配置

以下示例假定已有 `customers` Collection，在初始化阶段注册：

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

**预期结果：**手机号 `13812341234` 保存为 `138****1234`；`privateNote` 的前后值保存为 `[REDACTED]`。仅需变化标记时，改用 `changedOnly`，不要同时放入 `changes`。

`redaction.fields` 按字段名匹配已采集的前后值，不增加采集字段。Collection 和操作范围沿用外层规则；只匹配 `updateOne` 的规则，不会保护其他操作。

#### HTTP：只记录请求摘要

```ts
audit.addHttpRule({
  key: 'orders.approve.http',
  method: 'POST',
  path: '/api/orders/*/approve',
});
```

**预期结果：**记录已有路由的请求方法、命中路径规则、状态码、耗时等摘要；不采集请求体、响应体或凭证，不需要配置 `redaction`。多条规则命中同一请求，只生成一条摘要。

HTTP 结果不等于审批结果，也不推断订单键；通过 `requestId` 关联请求中的事件。审批理由等业务内容使用 `record()` 记录，并在调用前处理敏感值。

#### record：先处理业务敏感值

业务代码可以先遮蔽手机号，再调用 `record()`；以下示例只接受 11 位数字，其他内容整体替换：

```ts
const phone = '13812341234';
const safePhone = /^\d{11}$/.test(phone)
  ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
  : '[REDACTED]';

await audit.record({
  action: 'crm.customer.verify',
  resource: 'customers',
  resourceKey: { id: '123' },
  data: {
    phone: safePhone,
    reason: '联系方式已核验',
  },
});
```

**预期结果：**事件的 `data.phone` 为 `138****1234`。这是调用方预处理的结果，不是继承 `customers.audit` 规则。`record()` 没有业务脱敏配置参数；自定义值和自由文本应只传已经处理的必要内容，不能仅靠内置凭证键名识别。

#### 配置约定

| 配置 | 行为 |
| --- | --- |
| `redact` | 整体替换为 `[REDACTED]` |
| `{ keepStart, keepEnd }` | 两项为非负整数，保留字符串首尾，中间用固定 `****`；非字符串或长度不大于两项之和时整体替换 |
| 多条规则重叠 | `redact` 优先，否则首尾各取最小保留长度；没有配置不取消其他命中规则的保护 |

创建前、删除后表示记录不存在的一侧保持为空；字段先按真实值判断变化，脱敏后前后值相同仍保留变化。相同 key 的替换包含脱敏配置，新配置不改写历史。

三个入口均执行内置凭证保护，不能通过业务配置关闭：匹配 `password`、`passwordHash`、`token`、`accessToken`、`refreshToken`、`apiKey`、`secret`、`authorization`、`cookie`，忽略大小写及键名中的 `_`、`-`；覆盖字段名及已采集结构化数据中的同名键。凭证字段只留变化标记，`data` 中对应值替换为 `[REDACTED]`。

该保护不识别任意别名或自由文本；未配置的非凭证字段仍按采集规则保存。`actor`、目标和关联主键保留完整标识，不在可配置脱敏范围内，不得使用凭证作为标识。

脱敏不修改业务对象，在暂存和保存前完成。`metadata.redaction` 标明插件处理的位置；页面与导出显示已脱敏内容，`readValues` 无法取得原值。处理失败只留安全摘要，错误报告不附原始事件或敏感异常参数。

结构化脱敏拟复用 [@pinojs/redact](https://github.com/pinojs/redact)，不新增脱敏 Service API；范围见[设计第 4 节](./proposals/README.md#4-敏感数据与脱敏)。

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

## 5. 记录历史

记录历史直接使用 `auditEvents`，无需启用第二个插件，也无需重复配置采集规则。接入顺序为：配置需要追踪的字段 → 正常执行业务 → 安装历史组件；审批理由等信息沿用 `record()`。

### 接入订单历史组件

通过 Registry 安装历史组件到 App，在订单详情中使用：

```tsx
import { AuditHistory } from '../extensions/nocobase-audit-history-ui';

export function OrderHistory({ orderId }: { orderId: number }) {
  return <AuditHistory resource="orders" resourceKey={{ id: orderId }} />;
}
```

路径按实际安装目录调整。组件规范化记录键，通过 Server 授权、筛选和分页查询；修改展示样式不影响审计采集。

默认显示该订单的数据写入与显式绑定的自定义操作，不混入读取、HTTP 或登录摘要。自定义 `category` 不影响归属，未填写 `resourceKey` 的事件不显示在订单历史中。同一请求或事务中的其他目标也不会自动归入；`items` 关系增减不等于明细记录的全部字段历史。

### 直接查询关联事件

沿用第 1 章的 `db` 与 `order`，通过已有 Repository 查询绑定该订单的事件，无需历史专用 API：

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

此示例按目标查询已保存的关联事件；历史组件还按事件来源筛选写入与自定义操作，筛选在 Server 分页前完成，不能只取一页后在前端过滤。数字键按字符串查询，复合键传完整对象，例如 `{ tenantId: 't1', orderNo: 'SO-001' }`。

浏览器使用 `api.repository('auditEvents')` 经 Server 授权查询；可信 Server 的原生查询由调用方控制访问。`resourceKey` 是查询条件，不是权限凭证；能查看当前订单不代表有权查看历史，权限见[查看与可选设置](#6-查看与可选设置)。

### 预期结果与限制

审计保存成功时，订单 `123` 显示状态变化；订单 `124` 还可查看通过 `record()` 保存的审批理由或拒绝记录。仅使用默认规则时显示操作摘要，需要前后值时先配置 `changes`。

| 情况 | 历史展示 |
| --- | --- |
| `changedOnly` | 仅显示“已修改”，不显示前后值 |
| 已脱敏 / 已裁剪 / 无详情权限 | 分别提示“已脱敏”/“详情不完整”/“无权查看详情”，不把缺失值显示为业务空值 |
| 无可见事件 | 显示“暂无可见历史记录”，不表示从未修改或业务失败 |
| 无权访问 / 查询失败 | 明确提示，不伪装成空历史 |

历史受操作发生时的规则、审计保存结果、脱敏、裁剪及保留期影响；不补录启用前的变化，不提供完整版本或恢复操作。业务记录删除不级联删除已有事件；保留的历史仍需审计授权查看。设计边界见[记录历史](./proposals/README.md#6-记录历史)。

## 6. 查看与可选设置

审计列表查看已授权事件；记录历史接入见[上一章](#5-记录历史)。规则 Settings 只读展示内置规则、扩展规则和最终合并结果；选择 Collection 与 operation 即可检查采集字段和脱敏策略。

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
