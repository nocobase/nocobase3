---
title: Server Jobs
description: 通过 App 独立的 QueueService 注册、投递和测试后台任务，明确 Provider 生命周期、channel、payload、回执、幂等和关闭边界。
---

# Server Jobs

后台任务用于异步、延迟、批量或可重试工作。当前 API 是 `createQueueService()`、`QueueService`、`consumer(queue).consume(handler)` 和 `producer(queue).publish(channel, payload, options)`，不是 Job class、进程全局 dispatcher 或目录扫描。可复用业务行为仍放在领域 Service；需要请求立即返回领域结果的逻辑、Migration 或一次性启动操作不应伪装成后台任务。

## App 所有权与 Provider 顺序

App 的核心 `QueueServiceProvider` 从 `@nocobase/queue` 的 `createQueueService()` 创建独立服务，并绑定 `@nocobase/app-server/queue` 导出的 `queueServiceToken`。插件必须导入这个原始 Token；同名 `createServiceToken()` 不是同一 identity。不要创建第二个 QueueService、全局 container、跨 App handler registry 或自行管理共享 Worker。

| 阶段 | 所有者与操作 | 边界 |
| --- | --- | --- |
| `register()` | 核心绑定惰性 QueueService，插件绑定领域 Service | 不连接、不创建运行中的 Worker；自定义 backend factory 在 setup 前注册 |
| `boot()` | 插件解析依赖，调用 `consumer(queue).consume(handler)` 并保存注销函数 | 只注册，不 I/O、不消费 |
| `start()` | 核心 QueueServiceProvider 等待 `setup()` | App 拥有启动；插件不能提前 setup；领域依赖必须在消费开始前就绪 |
| `shutdown()` | 插件先等待注销，再释放依赖；核心最后关闭 QueueService | 按依赖逆序关闭，不由插件停止共享 Worker |

将领域依赖的 Provider 放在消费者之前，保证逆序 shutdown 时仍可使用它。注册阶段可以捕获服务，但服务构造不能隐式启动 I/O。核心 QueueServiceProvider 的 start 可能先于插件 start，不能用“插件之后会初始化数据库/engine”作为 handler 已就绪的依据。安装模式中业务表尚未创建时，必须明确激活条件，不能让提前消费访问未迁移的表。

`server/jobs/` 可以作为普通 handler module 的组织目录，必须显式 import；没有自动发现。旧 `queue.jobs` contribution 已退役并被拒绝，不是忽略后继续运行。`server:inspect` 可报告静态 Provider 装配和退役声明问题，但不执行 Provider、不运行 handler，也不证明队列可用。

## Provider 中注册 handler

下例假定插件自己的 `server/tokens.ts` 导出 `searchServiceToken`，服务契约包含 `rebuildIndex(collection: string, signal: AbortSignal): Promise<void>`，且领域 Provider 已注册。这里只展示队列接线，不提供搜索实现。

```ts
// server/providers/rebuild-index.ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueServiceToken } from '@nocobase/app-server/queue';
import type { UnregisterHandler } from '@nocobase/queue';
import { ServiceProvider } from '@nocobase/service-provider';
import { searchServiceToken } from '../tokens.js';

export default class RebuildIndexProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log/rebuild-index';
  private unregister: UnregisterHandler | undefined;

  public override async boot(): Promise<void> {
    const queue = this.app.container.resolve(queueServiceToken);
    const search = this.app.container.resolve(searchServiceToken);
    this.unregister = queue.consumer('@nocobase/app-plugin-audit-log/search').consume(
      async (channel, payload, signal): Promise<void> => {
        if (channel !== 'rebuild-index') return;
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('collection' in payload) ||
          typeof payload.collection !== 'string'
        ) {
          throw new Error('Invalid rebuild-index payload');
        }
        signal.throwIfAborted();
        await search.rebuildIndex(payload.collection, signal);
      },
    );
  }

  public override async shutdown(): Promise<void> {
    await this.unregister?.();
    this.unregister = undefined;
  }
}
```

在 `server/providers/index.ts` 导出 Provider 数组，通过 `server/plugin.ts` 的 `serviceProviders` 贡献到 App。不要添加 `queue: { jobs: ... }`。模块顶层只定义类、函数和 Token，不解析服务、连接数据库或启动后台任务。

Handler 的参数是 `(channel, message, signal)`，不是 Job 实例。Provider 从当前 App container 解析数据库、logger、i18n 和领域能力，通过闭包或显式依赖传给 handler；没有默认 Job factory 注入，也不把 container 放进 payload。纯函数或可注入领域 Service 仍可独立测试。

## 投递与回执

App 启动完成后，Route 或 Service 使用同一个 Token：

```ts
import { queueServiceToken } from '@nocobase/app-server/queue';

const queue = app.container.resolve(queueServiceToken);
const receipt = await queue.producer('@nocobase/app-plugin-audit-log/search').publish(
  'rebuild-index',
  { collection: 'auditLogs' },
  { delay: 1_000 },
);
// receipt.jobId is a publication receipt, not the handler's result.
```

`delay` 是非负数字，单位毫秒，不是 `{ seconds: ... }`。回执只有 `jobId`；`await publish()` 不等待执行完成，即使使用默认内存后端也是如此。需要用户可见的完成状态时，通过持久化业务结果或明确的 completion signal 观察，不固定 sleep、不用同步 mock 替代真实异步路径。HTTP producer 仍拥有自己的 authentication/authorization；进入队列不等于绕过权限。

Payload 必须 JSON 可序列化并在消费时校验。优先传业务 ID，不传 Service、Request Context、连接、函数或 secret；BigInt 和循环引用会失败。持久化队列里可能仍有旧 payload，修改格式要考虑兼容。生产者选择逻辑 queue，channel 区分其中的业务工作；backend、connection、namespace 在服务配置中决定，不是每次 publish 的路由选项。

## 默认后端与物理 identity

默认 `inMemory` 是每个 QueueService 私有的异步后端，不隐式连接 Redis，不提供重启持久性。App 默认 namespace 是 `appName`。生产持久化要显式选择 `redis` 并配置连接；显式配置失败时应报错，不能降级到内存并假装投递成功。

逻辑 queue 和 namespace 必须稳定；它们不是 JavaScript 类名。连接到同一持久化目标、相同 namespace 和 queue 的实例竞争消费，不是广播。不同 App 需要隔离时使用不同 namespace；内存服务即使同名仍隔离。一个本地队列使用一个 Worker，领取一次任务后并行运行该次快照中的 handlers 并等待全部 settled。channel 不是自动订阅过滤器，handler 必须主动判断；全部跳过也算完成，需要互相独立的交付保证时使用不同 queue。

Redis 部署使用 `maxmemory-policy=noeviction`，持久化和 HA 由部署负责，不承诺任意故障都不丢任务。不要设置 Redis `keyPrefix`，物理 key identity 由 QueueService 生成。队列存储不是 NocoBase 业务 collection，也不把投递自动加入业务数据库事务。连接、启动和清理预算必须按真实部署验证。

## 重试、批量和业务幂等

- `attempts` 包括首次执行；fixed/exponential backoff 和 `delay` 使用毫秒，retention 的 `age` 使用秒。未知自定义 retry strategy 不应假定可用。
- 任一 handler 失败会使本次任务失败；重试重新选择并执行整组 handler，不只重跑失败的那个。每个有副作用的 handler 都要可重复执行。
- 对邮件、外部 API、扣费、文件写入等使用稳定业务 key 或持久化执行状态。`jobIdProducer` 产生的 ID 只在任务仍保留时去重，删除或 retention 清理后可复用，不是永久 exactly-once 保证。
- 单条或批量投递超时、响应丢失，不证明没有写入；重试必须考虑任务已存在。`publishMany()` 先准备整批，不等同于循环 `publish()`；内存的批量提交具有原子性，Redis pipeline 服务端失败可能部分写入，不能跨后端承诺全有或全无。
- `manager(queue).configure()` 的本地配置更新与共享限流写入不是事务。后端失败时本地更新可能已生效，不要报告自动回滚。
- `manager(queue).drain()` 默认清除 waiting，`{ delayed: true }` 也清除 delayed，不取消 active。持久化共享队列上的清理影响全部实例，不能作为插件卸载的局部清理。
- 业务写入与投递需要一致性时，显式设计 outbox 或 reconciler，而不是假设队列会自动参与业务事务。

## 注销、取消与关闭

`consume()` 立即返回 `() => Promise<void>`。每次注册独立；注销幂等，先从新快照排除该注册，再等已有 invocation 完成。它不取消旧 invocation。最后一个注销只暂停本实例 Worker，不影响其他实例。只有注销成功完成，插件才能释放 handler 使用的 engine、连接或其他资源。

不要在 handler 内等待自身注销，也不要在 handler 内等待 QueueService shutdown；两者都可能等待正在执行的自己。注销没有替业务代码强制终止的能力，长任务必须有自身的有界 I/O 和协作退出策略。

`manager(queue).cancelJob()` 的 boolean 只表示找到本实例活动任务并发出 signal，不表示 handler 已结束；`cancelAllJobs()` 同样只作用于本实例 active 工作。用户取消是永久失败，不操作其他实例或 waiting/delayed；服务关闭的取消是另一种原因，不能把它改成用户永久取消。

正常 shutdown 先停止领取，等待 handlers 时 producer 仍可用，之后才拒绝新投递并关闭自有资源；不承诺排空 waiting。默认先等待 30000ms，再发关闭 signal 并等待 5000ms grace；可通过 `shutdownTimeoutMs` 和 `cancellationGraceMs` 调整。忽略 signal 的业务代码不会被 JavaScript 强制停止，超出宽限期必须报告关闭失败，不释放它仍在使用的依赖并宣称成功。App/资源所有者负责处置无法确认清理的资源。

## 请求外翻译

后台任务没有请求语言。Provider 解析原始 `i18nToken` 并把 runtime 或明确 translation adapter 捕获到 handler；对每个收件人的 locale 先 `ensureLocaleLoaded(locale)`，再取得绑定插件 namespace 和该 locale 的 translator。不要把全局 i18n 或触发者语言当成收件人语言。完整规则见[插件国际化](./i18n.md)。

## 分层测试

- 直接执行 handler，覆盖 channel 过滤、payload 校验、成功、错误和 signal；
- 注入领域依赖，验证其边界，不只检查文件存在；
- 使用真实异步 `inMemory` 服务证明 boot 不执行、start 后消费、回执与完成分离；
- 用可控 barrier 验证注销等已有 invocation 后才释放依赖，不以固定 sleep 猜时序；
- 覆盖两个 App 的相同 queue/channel，不共享 handler、dispatcher 或内存状态；
- 验证重试重复执行的业务幂等、关闭失败和发布失败后的恢复策略；
- 用实际选择的 Redis 后端验证持久化、跨实例竞争和资源清理，不能用内存通过代替；
- 需要 HTTP producer 时，覆盖匿名、无权限和允许访问；
- 构建后验证 Provider 和显式 handler imports 进入产物，退役 `queue.jobs` 不再出现在声明中。

`packages/examples/app-plugin-queue-example` 是 Provider 注册和异步回执的最小参考；示例中的 App 私有内存状态只是观察结果，不是生产持久化或幂等方案。

返回[Server 模块选择](./server.md)，或阅读[测试和验证插件](./testing.md)。
