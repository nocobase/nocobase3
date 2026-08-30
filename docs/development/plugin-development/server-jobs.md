---
title: Server Jobs
description: 在 NocoBase v3 插件中定义、发现、派发和测试 Queue Job，并明确 payload、领域依赖、重试、幂等和 worker 边界。
---

# Server Jobs

Job 用于异步、延迟、批量或可重试的后台工作。Job handler 编排一次执行，可复用领域行为仍应从 Job class 中分离；需要请求立即返回结果的逻辑、Migration 或一次性 Server 启动操作不属于 Job。

## 定义稳定 Job 和 payload

```ts
import { Job, type JobOptions } from '@nocobase/queue';

export interface RebuildIndexPayload {
  readonly collection: string;
  readonly requestedAt: string;
}

export default class RebuildIndexJob extends Job<RebuildIndexPayload> {
  public static options: JobOptions = {
    name: 'AuditLogRebuildIndex',
    queue: 'default',
  };

  public async execute(): Promise<void> {
    // Validate payload and call a reusable domain operation here.
  }
}
```

Job name 是排队任务的稳定 identity，不要依赖重构后可能变化的匿名类名。Payload 必须可序列化、可校验并能在 worker 进程重建；不要放入 Service 实例、Request Context、数据库连接、函数或 secret。发布后改变 payload 时要考虑队列中尚未执行的旧任务。

## 声明发现位置

在 `server/plugin.ts` 使用 package-relative location：

```ts
queue: {
  jobs: ['./server/jobs'],
}
```

App 启动时由 Queue runtime 加载该目录。构建和发布必须包含实际 Job module。`server:inspect` 只报告 configured/resolved locations，不 import Job，不验证 handler，也不启动 worker。

## 派发 Job

生产者从 container 解析 `queueManagerToken`，再以 Job class 和 typed payload 派发：

```ts
const queue = container.resolve(queueManagerToken);

await queue.dispatch(RebuildIndexJob, {
  collection: 'auditLogs',
  requestedAt: new Date().toISOString(),
});
```

派发选项可以选择 queue、connection、priority、delay、group 或 dedup。Route 触发派发时仍要拥有自己的 authentication/authorization；进入队列不等于绕过业务权限。

## 重试和幂等

一次任务可能被重试或重复投递。对邮件、外部 API、扣费、文件写入等副作用使用稳定业务 key、dedup 或持久化执行状态。区分可重试的暂时错误与不应重试的输入/业务错误，并记录 job ID、queue、attempt 和非敏感业务 identity。

不要依赖当前进程内 Map 或全局变量保存完成状态；真实 worker 可能位于另一个进程，也可能在重启后继续执行。

## 与领域能力配合

推荐结构：

```text
Route / event → queue.dispatch(Job, payload)
Job.execute() → validate payload → call reusable domain operation
domain operation → behavior and persistence
```

当前默认 Queue job factory 构造 Job 时提供 `database` 和 `logger`，不提供 `ServiceContainer`。不要在 Job 中假设可以直接 `container.resolve()`，也不要只为单元测试设计一个生产环境不会使用的 constructor。需要共享逻辑时，把它提取成可由明确依赖构造的领域操作；需要连接 App container Service 的复杂插件，应由插件 Provider 建立显式 adapter 或 dispatcher，并对该集成做目标 App 测试。不要把尚不存在的通用 Service 注入机制写进 Job 契约。

## 分层测试

- 直接执行 handler，覆盖 payload 校验、成功和错误；
- 使用 fake domain dependency 或 queue 验证 Job 与领域逻辑的边界；
- 覆盖重复执行、dedup、retryable 和 terminal failure；
- 验证 Job name、queue 和 payload contract 稳定；
- 验证 `server/plugin.ts` 声明真实 location；
- 运行目标 App Queue integration，确认发现、派发、worker 和关闭流程；
- 需要 HTTP producer 时，继续覆盖 Route 的匿名、无权限和允许访问。

`packages/app-plugin-queue-example` 是最小发现和派发参考；复杂持久化、worker lifecycle 和幂等策略应参考与当前业务相近的真实插件，而不是复制演示插件的内存数组。

返回[Server 模块选择](./server.md)，或阅读[测试和验证插件](./testing.md)。
