# 确定通知后端的构建与直接挂载契约

Type: grilling
Status: resolved

## Question

在不引入通用 AppServerExtension 的前提下，通知后端如何从 `registry/notification/server` 被开发服务器、TypeScript 构建、生产产物、独立运行与 AppHost 嵌入模式一致地直接挂载，并在关闭时可靠释放 Worker、数据库和 WebSocket 资源？

## Answer

> 2026-08-19 develop 更新：App Template 已引入 `@nocobase/app-server` Runtime、共享 DatabaseManager、QueueManager、Logger 和统一 Services dispose。本票据的直接挂载目标不变，但旧的“createApp 自行构造数据库/队列并拥有其关闭”被覆盖：通知模块从 App Services 接收共享依赖，只停止自己创建的 Queue Worker、Reconciler 和 Timer；QueueManager 由 App Services 关闭，DatabaseManager 由 App Runtime 最后销毁。Standalone/Embedded 已共用 runtime preparation 与 close，不再另建通知专用 Scope。

### 构建与直接挂载

- 采用临时直接接线：`server/services/index.ts` 静态 import `registry/notification/server`，由 `server/app.ts` 挂载返回的 Router；不引入自动发现、通用 `AppServerExtension` 或独立服务端 Registry 包。这样共享 App Services 仍是资源装配与关闭的唯一组合点。
- 服务器 TypeScript 构建临时同时包含 `server/**` 与 `registry/notification/server/**`，生产产物保留 `dist/server/**` 与 `dist/registry/notification/server/**`；生产依赖扫描同时覆盖两个运行时目录。该方案只解决通知 3.0 的当前构建，后续由专门的服务端 Registry 构建方案替换。
- 通知 HTTP API 对外固定挂载在 `/<app>/api/notifications/*`。AppHost 先剥离 `/<app>`，Embedded 应用内部处理 `/api/notifications/*`；Standalone 暴露相同的外部路径。

### 唯一构造入口与依赖边界

- 应用使用统一 Runtime 构造链：Standalone/Embedded 先异步准备配置、数据库和 migrations，再由同步 `createApp()` 组合 Hono、App Services 与通知模块；构造过程不监听端口，也不安装进程信号。
- `createApp()` 是组合入口，从 App Services/Runtime 向 `createNotificationModule()` 显式注入 DatabaseManager、QueueManager、Logger、LivePublisher、signal 与通知配置，不在通知领域内读取全局状态。
- 通知领域不得直接读取 `process.env`、AppHost 全局状态、WebSocket 单例或具体数据库实现。Standalone 创建与 Embedded 语义一致的本地 Scope。
- 核心数据库打开、migration 或通知 Worker 初始化失败时，整个 Portal 激活失败；SMTP 未配置、被禁用或配置错误只影响相应 Provider，不阻止 Portal 启动。

### AppHost 激活语义

- 保持 AppHost 原有懒激活和空闲回收逻辑，不为通知 Worker 增加 eager/dedicated 特例。
- Worker 在 Portal 第一次被访问并成功激活时启动，在 Portal 被回收时停止。进程重启或回收后的遗留数据库任务只在 Portal 下次激活时恢复；本期不承诺无访问流量时持续处理任务。

### 实时能力边界

- 消息推送独立于通知模块，由独立 Portal Live Runtime 提供。客户端接口参考 [Refine `LiveProvider`](https://refine.dev/core/docs/realtime/live-provider/) 的 `subscribe`/`unsubscribe` 契约，一期传输采用同源 WebSocket；服务端向业务模块暴露抽象 `LivePublisher`。
- 通知模块只在 UserNotificationItem 持久化变化后发布 Live Event，不创建 WebSocket Server、不处理 Upgrade、不维护连接，也不负责实时基础设施的关闭。
- AppHost 的 Upgrade、认证、应用/用户隔离、重连和未来 Pub/Sub 属于[确定独立 Live Provider 与实时事件协议](11-websocket-event-protocol.md)，不再属于通知后端直接挂载契约。

### 关闭与资源所有权

- AppHost 的必要生命周期修正属于允许的目录外接线：并发 `destroy()` 必须返回同一 Promise；进入 draining 后拒绝新请求和任务领取；请求 lease 持有到响应体完成或取消；创建失败也进入同一清理管线。
- 关闭使用一个绝对期限，优先取 `resourcePolicy.drainTimeoutMs`，默认 10 秒，覆盖排空、Worker 停止和数据库关闭，不为每个阶段重置预算。
- 顺序为：停止通知入口与新任务领取，等待请求和执行中任务，期限到达后触发 AbortSignal，停止通知 Worker/Reconciler，再由 App Services 关闭共享 QueueManager，最后由 App Runtime 销毁共享 DatabaseManager。
- 所有 disposer 都应被尝试；失败汇总为结构化 Shutdown Report，由 AppHost 记录。Standalone 同时设置非零退出状态。
- Standalone 改为返回包含 `app`、Node Server、`start()` 与 `close()` 的生命周期句柄；CLI 使用一次性锁处理 `SIGINT`/`SIGTERM`，不再由 `startServer(): void` 丢弃服务器所有权。
