---
title: 'AI 员工配置参考'
description: '通过 config.yml 配置 NocoBase AI 员工的 LLM、附件存储、Skill 目录和 MCP 服务。'
keywords: 'NocoBase,config.yml,ai.llmServices,ai.storage,ai.skills,ai.mcpServers'
---

# AI 员工配置参考

AI 员工的部署级配置位于应用根目录的 `config.yml` 的 `ai` 节点下。这里适合声明连接地址、凭据引用、存储磁盘和额外资源目录。员工角色和 Tool 代码仍放在应用源码中；用户可调整的员工和模型状态由管理页保存。

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

AI 员工插件会递归展开 `llmServices` 和 `mcpServers` 中的 `${NAME}`。其他任意 `config.yml` 字段没有这项通用能力。密钥只放在 Server 可读取的环境中，不要放到 `config.yml.client`。

## 配置重载

LLM 和 MCP 配置订阅 `ai` 命名空间，配置重载后会重新同步，不需要重新扫描静态资源。Employee、Tool、Skill 和 `ai/mcp` TypeScript 文件不会随配置重载重新加载，修改它们后要重启服务。

为了减少首次配置时的状态差异，[快速开始](../quick-start.md) 统一使用“修改配置后重启”的操作路径。

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
