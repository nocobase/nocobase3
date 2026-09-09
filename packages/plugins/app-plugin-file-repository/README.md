# 文件 Repository

`@nocobase/app-plugin-file-repository` 提供文件上传、元数据 CRUD 和统一访问地址。Server 基于数据库 Repository 与 Drive，Client 复用应用已有的 API Client；两端通过 Service Provider 提供 Manager。

[使用手册](docs/README.md)集中说明四种用法：

- 服务端用 `defineFileRepositoryApiRoutes()` 声明资源 API 和文件访问路由。
- 服务端通过 `serverFileRepositoryManagerToken` 使用 Repository。
- 客户端通过 `clientFileRepositoryManagerToken` 查询和上传文件。
- React 组件通过 `useService()` 调用同一 Client Manager。

核心插件只提供服务与路由工具。Collection 迁移、具体资源路由和业务页面由应用或业务插件拥有；可运行的 `attachments` 示例见 [File Repository Example](../../examples/app-plugin-file-repository-example/README.md)。

供 App Agent 使用的集成指南见 [SKILL](skills/nocobase-app-plugin-file-repository/SKILL.md)。当前认证授权、stream 和文件删除边界见手册的[当前限制](docs/README.md#当前限制)。

已采纳的设计保留在[提案文档](docs/proposals/README.md)，用于追溯设计约定与暂未实现的范围。
