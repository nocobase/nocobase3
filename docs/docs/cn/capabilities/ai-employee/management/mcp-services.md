---
title: 'MCP 服务管理'
description: '在设置页的 MCP 服务页查看 MCP 连接、启用服务并维护 Tool 权限。'
keywords: 'MCP settings,MCP tools,ASK,ALLOW,stdio,http,sse'
---

# MCP 服务管理

设置页侧栏「AI」分组中的「MCP 服务」页（`/settings/ai/mcp-services`）列出 `config.yml` 已声明的 MCP 服务。表格显示 UID、标题、Transport、Enabled 状态和查看操作。连接定义本身只读。

![MCP 服务和 Tool](https://static-docs.nocobase.com/20260914111142-ai-employee-mcp-services.png)

## 启用或停用服务

使用 Enabled 开关控制这个 MCP 服务是否参与运行。开关状态保存在数据库中，服务重启后保持不变：`config.yml` 里的 `enabled` 只在服务第一次被创建时生效，之后以管理页的开关为准，这一点和 LLM 服务相同。

服务重启会重建 MCP Client；服务命令、URL 或认证 Header 要在 `config.yml` 中修改。

Transport 标签可能是：

- Stdio
- HTTP (Streamable)
- HTTP + SSE (Legacy)

## 查看 Tool

点击 View 打开右侧面板。面板显示服务名称、Transport、可公开的 URL 以及当前发现的 Tool。每个 Tool 显示标题、注册名和描述。

MCP Tool 的注册名是 `mcp-<服务名>-<Tool 名>`，Scope 是 `GENERAL`，服务连上之后所有员工都能用到，不需要逐个员工开启。在 Skill 的 `tools`、员工的 `tools` 或会话的 `skillSettings` 中引用它时，使用这个完整的注册名。只想让某个员工不用某个 MCP Tool 时，在「AI 员工」页这个员工的 Tools 标签页中关掉它。注意，员工的 Tool 开关一旦在管理页改过并保存，就会固定成一份名单，之后新发现的 MCP Tool 不会自动加入这个员工，需要到它的 Tools 标签页中手动打开。

没有 Tool 时，依次检查服务是否启用、进程或 URL 是否可访问、认证信息是否有效，以及 MCP 服务是否正确实现 Tool discovery。服务端返回给管理页的敏感 Header 和环境值会被脱敏。

## 设置 Tool 权限

每个发现的 Tool 可以选择：

| 权限  | 行为                             |
| ----- | -------------------------------- |
| Ask   | 模型提出调用后暂停，等待用户确认 |
| Allow | 满足其他运行时策略时直接调用     |

默认权限按 MCP 服务端的 Tool 名推断：名称以 `get` 开头的 Tool 默认 Allow，其他默认 Ask。这只是根据名称的猜测，不代表 Tool 真的没有副作用。调整后的权限保存在数据库中，服务重启后保持不变。

远程服务的 Tool 实现不在 NocoBase 代码库内。逐个检查发现的 Tool 的描述和参数，除非是明确无副作用、可重复且数据范围可控的读取，否则保持 Ask——包括名称以 `get` 开头、实际却会写入或产生外部影响的 Tool。MCP Tool 权限仍不能替代远程服务自己的身份校验和授权。

## 修改连接

管理页不提供新增、编辑或删除。修改 `ai.mcpServers` 后重启服务，服务集合会同步，MCP Client 会重建。

## 相关链接

- [MCP 服务配置](../configuration/mcp.md) — 修改连接、命令和 Header
- [注册 Tool](../development/tool.md) — 理解 Ask 与 Allow
- [AI 员工管理](./employees.md) — 为单个员工开关 Tool
