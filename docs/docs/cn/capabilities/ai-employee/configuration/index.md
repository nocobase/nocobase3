---
title: 'AI 员工配置参考'
description: '通过 config.yml 配置 NocoBase AI 员工的 LLM、附件存储、Skill 目录和 MCP 服务。'
keywords: 'NocoBase,config.yml,ai.llmServices,ai.storage,ai.skills,ai.mcpServers'
---

# AI 员工配置参考

AI 员工的部署级配置位于应用根目录的 `config.yml` 的 `ai` 节点下。这里用于声明 LLM 和 MCP 连接、凭据引用、存储磁盘和额外 Skill 目录。MCP 服务只能在 `config.yml` 中配置。员工角色和 Tool 代码仍放在应用源码中；用户可调整的员工和模型状态由管理页保存。

## 完整结构

```yaml
ai:
  storage:
    disk:
      - local
  aiEmployee:
    storage:
      disk:
        - ai-files
  skills:
    paths:
      - ./company-ai-skills
  llmServices:
    - name: gpt
      title: GPT
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        - label: GPT-5.6
          value: gpt-5.6
      enabled: true
      sort: 10
  mcpServers:
    company-search:
      transport: http
      url: ${COMPANY_MCP_URL}
      headers:
        Authorization: Bearer ${COMPANY_MCP_TOKEN}
```

AI 员工插件会递归展开 `llmServices` 和 `mcpServers` 中的 `${NAME}`。其他任意 `config.yml` 字段没有这项通用能力。密钥不要写进任何入库的文件，也不要放到 `config.yml` 的 `client` 块，这个块会下发到浏览器。密钥可以放在哪里、各自的限制，见[快速开始 · 第二步](../quick-start.md#第二步配置密钥并重启)。

## 修改后重启

服务只在启动时读取环境变量、`config.yml` 和 `.env`。修改其中任何一项，都要重启服务才会生效；启动时 LLM 和 MCP 配置会重新同步。修改 Employee、Tool 和 Skill 等静态资源同样要重启服务。

环境变量还要先在启动服务的终端里生效：执行 `source` 重新加载 shell 配置文件，或者重开一个终端，再从这个终端重启服务。已经在运行的进程不会读到新设置的变量。

## 数据所有权

| 配置                    | 谁是权威来源                        | 管理页能做什么                             |
| ----------------------- | ----------------------------------- | ------------------------------------------ |
| `ai.llmServices`        | `config.yml` 中的服务名称和连接结构 | 保留并调整已有服务的 Enabled 和模型列表    |
| `ai.mcpServers`         | `config.yml` 中的服务全集           | 启用服务、查看 Tool 和调整权限，不增删连接 |
| `ai.aiEmployee.storage` | `config.yml`                        | 管理页不修改                               |
| `ai.skills.paths`       | `config.yml`                        | 管理页可把已加载 Skill 绑定给员工          |

## 相关链接

- [LLM 服务](./llm.md) — Provider、模型和连接字段
- [附件存储](./storage.md) — AI Employee 文件磁盘优先级
- [MCP 服务](./mcp.md) — `stdio`、`http` 和 `sse` 配置
- [管理 AI 服务](../management/index.md) — 查看运行时同步结果
