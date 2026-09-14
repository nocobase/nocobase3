---
title: '注册 MCP 服务'
description: '使用 defineMCP 和 MCPLoader 从应用源码注册 MCP 服务。'
keywords: 'MCP,defineMCP,MCPLoader,stdio,http,sse,NocoBase'
---

# 注册 MCP 服务

**MCP（Model Context Protocol）服务** 可以把外部系统提供的 Tool 接入 AI 员工。连接固定、需要随应用源码交付时，可以在 `ai/mcp` 中使用 TypeScript 定义；部署环境差异较大时，通常来说直接使用 `config.yml` 更方便。

## 定义 HTTP MCP 服务

在 `ai/mcp/company-search.ts` 中默认导出 `defineMCP()` 的结果：

```ts
import { defineMCP } from '@nocobase/ai-employee';

export default defineMCP({
  title: 'Company Search',
  transport: 'http',
  url: process.env.COMPANY_MCP_URL ?? '',
  headers: {
    Authorization: `Bearer ${process.env.COMPANY_MCP_TOKEN ?? ''}`,
  },
  enabled: true,
});
```

注册名来自模块文件名，因此这个服务的名称是 `company-search`。不要把 Bearer Token 写成源码常量。

## 定义 Stdio MCP 服务

本地进程使用 `stdio`：

```ts
import { defineMCP } from '@nocobase/ai-employee';

export default defineMCP({
  title: 'Local Files',
  transport: 'stdio',
  command: 'npx',
  args: [
    '-y',
    '@modelcontextprotocol/server-filesystem',
    '/srv/nocobase/shared',
  ],
  enabled: false,
});
```

`stdio` 使用 `command`、`args` 和可选的 `env`。`http` 与兼容旧服务的 `sse` 使用 `url` 和可选的 `headers`。

## 让 Registrar 加载目录

创建 `AppAIResources` 时，把 MCP 目录传给 `mcpDirectory`：

```ts
const resources = new AppAIResources({
  mcpDirectory: path.resolve(this.app.paths.root(), 'ai/mcp'),
  source: 'application',
});
await resources.registerAIResources(ai);
await ai.mcpServerManager.rebuildClient();
```

`AIResourceRegistrar` 会在注册 Tool 之后、加载 Skill 之前运行 `MCPLoader`。Registrar 只负责登记资源；应用 Provider 还必须调用 `rebuildClient()` 建立连接，发现的 Tool 才会进入员工运行时。

代码加载的 MCP 只在应用启动时扫描。运行中重新加载 `ai.mcpServers` 会按配置文件的名称集合重新同步 MCP，并不会再次扫描 `ai/mcp`；因此修改代码定义后应重启应用，不要依赖配置热重载恢复代码加载的服务。

:::warning 注意

远程 MCP 服务等同于给 AI 员工增加外部执行能力。只连接可信服务，限制它能访问的数据，并在「MCP」管理页检查每个 Tool 的 `ASK` / `ALLOW` 权限。

:::

## 相关链接

- [定义自己的 AI 员工](./index.md) — 把 MCP 加入应用资源生命周期
- [MCP 配置](../configuration/mcp.md) — 使用 `config.yml` 声明 MCP 服务
- [MCP 服务管理](../management/mcp-services.md) — 启用服务并调整 Tool 权限
