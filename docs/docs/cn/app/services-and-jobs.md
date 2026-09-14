---
title: '后台任务'
description: '定时跑的活儿、耗时的活儿。'
---

# 后台任务

本页面向两类用户：在应用中定义定时任务的应用开发者，以及查看运行
状态的业务管理员。

## 概览

定时任务按照五段或六段 Cron 表达式，在指定时间调用一个已允许的执行
目标。Scheduler 插件负责排程、幂等、异步执行状态和历史记录。执行目标
有两种：

- **工作流**：通过稳定的工作流 key 调用；
- **代码 Job**：由服务端代码显式注册、加入允许名单的 Job。

当前版本是“代码定义、界面只读”。管理员不能在界面中新建、修改、暂停
或删除任务；需要由开发者修改插件中的定义并重新部署。这可以避免生产
环境的任务配置与代码悄悄分叉。

## 快速开始：让 Agent 协助创建

在已启用 Scheduler 和 Workflow 插件的应用中，可以对 App Agent 这样描述：

> 创建一个记录时间戳的工作流，每五分钟执行一次，使用
> `Asia/Singapore` 时区，并告诉我如何验证执行结果。

Agent 应创建或更新工作流，并在服务端插件中加入代码定义的定时任务。其
核心定义如下：

```ts
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';

export default [
  defineSchedule({
    key: 'record-timestamp-every-5-minutes',
    title: '每五分钟记录时间戳',
    schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
    target: {
      type: 'workflow',
      config: { workflowKey: 'record-timestamp', input: {} },
    },
  }),
];
```

代码注册到应用后，在应用根目录运行 `pnpm nocobase scheduler sync`。进入“设置 →
自动化 → 定时任务”，打开任务详情查看下次运行时间。异步目标开始时会
显示 `waiting`，随后进入 `succeeded`、`failed`、`cancelled` 或
`timed_out` 等最终状态。

## 应用开发者：加入定时任务

### 定义任务

将 `@nocobase/app-plugin-scheduler` 声明为 peer 和开发依赖。在插件中创建
一个默认导出 `defineSchedule()` 结果数组的模块，并在 Server 插件声明中
暴露它：

```ts
// server/schedules.ts
import { defineSchedule } from '@nocobase/app-plugin-scheduler/server';

export default [
  defineSchedule({
    key: 'daily-customer-sync', // 稳定标识，不要随意修改
    title: '每日同步客户',
    description: '启动客户同步工作流。',
    schedule: { cron: '0 2 * * *', timezone: 'UTC' },
    enabled: true,
    target: {
      type: 'workflow',
      config: { workflowKey: 'customer-sync', input: {} },
    },
  }),
];
```

```ts
defineServerPlugin({
  packageName: '@acme/customer-sync',
  schedules: { definitions: './server/schedules' },
});
```

`key` 必须是稳定标识；Cron 支持五段或六段，并使用 `UTC` 或 IANA 时区
（例如 `Asia/Singapore`）。`from`、`to` 包含边界，`limit` 是排程领取次数
的上限，不是工作流步骤或目标完成次数的上限。`target.config` 中禁止放
密码、API key、访问令牌、凭据或其他秘密。

新增或修改定义后运行 `pnpm nocobase scheduler sync`。它会校验完整清单并执行非破坏
性的 upsert。生产部署确认已加载全部插件后，每个应用运行一次
`pnpm nocobase scheduler sync --finalize`，将清单中已不存在的定义软停用。不要直接
修改 `schedule_definitions`、`queue_schedules` 或 `schedule_occurrences`。

### 工作流任务

使用 `type: 'workflow'`，配置稳定的 `workflowKey` 和 JSON 对象 `input`。
Workflow 插件会以本次定时任务 occurrence 作为幂等依据启动运行。工作流不
存在或已禁用时，管理页会显示目标异常，任务不会成功执行。

### 代码 Job 任务

当操作必须由服务端代码完成时使用 Job。所属插件需要在 Provider 的
`boot()` 生命周期中，通过 `jobDispatchRegistryToken` 显式注册 Job：包括
稳定名称、标题、payload 校验和 dispatch 函数。同步操作返回
`completed`；队列操作返回带稳定引用的 `accepted`。

```ts
const jobs = this.app.container.resolve(jobDispatchRegistryToken);
jobs.register({
  name: 'customer-sync',
  title: '客户同步',
  validate: (payload) =>
    payload && typeof payload === 'object'
      ? { valid: true }
      : { valid: false, reason: 'invalid-payload' },
  async dispatch(payload, context) {
    await runCustomerSync(payload, { idempotencyKey: context.occurrenceId });
    return { state: 'completed', outcome: 'succeeded' };
  },
});
```

定义中的目标这样引用已注册的 Job：

```ts
target: {
  type: 'job',
  config: { jobName: 'customer-sync', payload: { full: false } },
}
```

不要暴露任意队列 Job 名称。队列 Job 应使用 `context.occurrenceId` 作为去重
键，并为 `queue-job` 引用类型注册一个 observer，以便 worker 或进程故障后
补偿遗漏的完成通知。

### 发布前验证

确认同步成功、管理页显示任务、下次运行时间符合时区，并确认一次到期只产
生一条执行记录。重复启动 worker 不应创建重复 occurrence。

## 业务管理员：查看和判断任务

用户需要 `scheduler.schedules:access` 权限。进入“设置 → 自动化 → 定时任务”
后，列表会显示名称、Cron 描述和时区、目标类型、运行次数、上次运行、下次
运行及状态：

- **运行中**：任务启用且目标可用；
- **已暂停**：任务被禁用或队列排程处于暂停状态；
- **已失效**：在 `--finalize` 后已不在完整代码清单中；
- **目标异常**：工作流或 Job 缺失、禁用或无效。

可使用搜索、状态和目标类型筛选。进入任务详情可以查看排程定义、目标摘要、
上下次运行以及执行记录。每条记录包括开始时间、耗时、目标链接
（如果目标提供）和状态：

- `waiting`：目标已接受请求，Scheduler 正在等待最终结果；
- `running`：Scheduler 正在分发执行；
- `succeeded`：目标成功完成；
- `failed`：分发或目标执行失败；
- `skipped`：目标被禁用或主动跳过；
- `cancelled` / `timed_out`：未成功完成；
- `triggered`：旧记录只表示目标已接受请求，最终结果未知。

界面不会显示工作流输入或 Job payload。遇到任务失效或目标异常时，应联系
应用开发者修复源代码并重新同步；管理页是监控界面，不是操作控制台。
