---
title: 'MCP 服务配置'
description: '通过 config.yml 配置 stdio、HTTP 和 SSE MCP 服务。'
keywords: 'MCP,Model Context Protocol,stdio,http,sse,config.yml'
---

# MCP 服务配置

MCP 服务只能通过应用根目录的 `config.yml` 配置。`ai.mcpServers` 以对象键作为服务的稳定名称，并以整个配置集合为权威来源；管理页不负责创建、编辑或删除连接。

## Stdio 服务

`stdio` 在 NocoBase Server 进程的运行环境中启动子进程：

```yaml
ai:
  mcpServers:
    filesystem:
      transport: stdio
      command: npx
      args:
        - -y
        - '@modelcontextprotocol/server-filesystem'
        - /srv/nocobase/shared
      env:
        MCP_API_KEY: ${MCP_API_KEY}
```

`command` 必须在部署环境中可执行，`args` 是字符串数组，`env` 会传给 MCP 子进程。使用最小目录和最小凭据，不要让文件系统 MCP 访问整个主机。

## HTTP 服务

```yaml
ai:
  mcpServers:
    company-search:
      transport: http
      url: ${COMPANY_MCP_URL}
      headers:
        Authorization: Bearer ${COMPANY_MCP_TOKEN}
```

HTTP 服务使用 `url` 和可选 `headers`。旧服务只支持 Server-Sent Events Transport 时，可以把 `transport` 改为 `sse`，字段仍使用 `url` 和 `headers`。

## 环境变量

AI 员工插件会递归展开 MCP 配置中的 `${NAME}`。变量缺失时替换为空字符串，通常会在连接测试或认证阶段暴露错误。不要把 Token 直接提交到 YAML，也不要把 MCP 密钥放入浏览器可见的 `config.yml.client`。

## 重载和诊断

配置重载会同步新增、更新和删除的服务，并重建 MCP Client。打开 `/settings/ai` 的「MCP」Tab，可以启用服务并查看它发现的 Tool。

![MCP 服务和 Tool](https://static-docs.nocobase.com/20260914111142-ai-employee-mcp-services.png)

管理页是只读连接视图。需要修改 URL、命令、参数或 Header 时，编辑 `config.yml` 后重载配置或重启服务。

## 安全建议

- 只连接可信 MCP 服务
- 为远程服务使用最小权限凭据和 TLS
- 为 `stdio` 限制可执行命令、工作目录和文件范围
- 检查每个发现 Tool 的描述和参数，再允许员工使用
- 对写入或外部副作用 Tool 保持 `ASK`

## 相关链接

- [MCP 服务管理](../management/mcp-services.md) — 启用服务、查看 Tool 并调整权限
- [注册 Tool](../development/tool.md) — 了解 Tool 权限
