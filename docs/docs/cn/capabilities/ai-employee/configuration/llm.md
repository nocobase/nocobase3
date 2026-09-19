---
title: 'LLM 服务配置'
description: '配置 AI 员工可用的 LLM Provider、连接参数、模型和默认状态。'
keywords: 'LLM Provider,OpenAI,Anthropic,Google Gemini,DeepSeek,Ollama,enabledModels'
---

# LLM 服务配置

`ai.llmServices` 是服务连接的声明式快照。每个服务都有稳定 `name`、一个内置 `provider` 和 Provider 连接参数。同一个 Provider 可以声明多个服务，例如不同账号、区域或网关。

## 配置字段

```yaml
ai:
  llmServices:
    - name: gpt
      title: GPT
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
        baseURL: https://api.openai.com
      enabledModels:
        - label: GPT-5.6
          value: gpt-5.6
      modelOptions:
        temperature: 0.2
      enabled: true
      sort: 10
```

| 字段            | 是否必填 | 说明                                                  |
| --------------- | -------- | ----------------------------------------------------- |
| `name`          | 是       | 服务唯一标识，也是 `ModelRef.llmService` 的值         |
| `provider`      | 是       | 内置 Provider 注册键                                  |
| `title`         | 否       | 管理页显示名称                                        |
| `options`       | 否       | Provider 连接参数，通常包含 `apiKey` 和可选 `baseURL` |
| `enabledModels` | 否       | 自定义模式下开放的 `{ label, value }` 模型数组        |
| `modelOptions`  | 否       | 传给模型客户端的默认参数                              |
| `enabled`       | 否       | 新服务首次同步时的初始启用状态                        |
| `sort`          | 否       | 管理页排序值                                          |

省略 `enabledModels` 表示 Provider 模型模式，可以在管理页搜索 Provider 返回的模型。配置文件中的标准写法始终是数组，不要在 YAML 中写数据库使用的 `{ mode, models }` 结构。

## 内置 Provider

| `provider`           | 服务                    | 备注                              |
| -------------------- | ----------------------- | --------------------------------- |
| `openai`             | OpenAI Responses        | 默认 OpenAI 实现，支持网页搜索    |
| `openai-completions` | OpenAI Chat Completions | 兼容只实现 Completions API 的服务 |
| `google-genai`       | Google Gemini           | 使用 Google Generative AI API     |
| `anthropic`          | Anthropic               | Claude 及 Anthropic 兼容接口      |
| `deepseek`           | DeepSeek                | DeepSeek Chat / Reasoning         |
| `dashscope`          | Alibaba Cloud DashScope | 通义千问等 DashScope 模型         |
| `kimi`               | Kimi                    | Moonshot/Kimi 接口                |
| `mimo`               | MiMo                    | Xiaomi MiMo 接口                  |
| `mistral`            | Mistral AI              | Mistral 模型                      |
| `ollama`             | Ollama                  | 自托管本地模型服务                |
| `orcarouter`         | OrcaRouter              | 聚合模型路由服务                  |
| `shengsuanyun`       | 胜算云                  | 胜算云模型服务                    |
| `xai`                | xAI                     | Grok 模型                         |

Provider 注册键区分大小写。`provider: openai` 当前对应 Responses API；已有网关只兼容 Chat Completions 时，改用 `openai-completions`。

## 模型值

模型条目的 `label` 只影响显示，`value` 会真正发送给 Provider：

```yaml
enabledModels:
  - label: GPT-5.6
    value: gpt-5.6
```

NocoBase 当前内置 OpenAI 模型目录包含 `gpt-5`，不包含 `gpt-5.6`。上面的 `5.6` 是自定义模型示例；只有服务商实际接受这个 ID 时才能调用。否则应使用管理页返回的模型 ID，或把 `value` 改成账号真实可用的模型。

## 同步行为

配置重载时，`ai.llmServices` 的名称集合是权威集合：新增名称会创建服务，保留名称会更新 Provider、标题和连接结构，删除名称会移除相应配置服务。匹配到已有服务时，管理员在数据库中维护的 Enabled 状态和模型列表会保留，不会被每次重载覆盖。

配置验证会在写数据库前完成。名称重复、字段类型错误或空 `name` / `provider` 会拒绝整份快照，避免只同步一半。

## 相关链接

- [快速开始](../quick-start.md) — 配置第一个 OpenAI 服务
- [LLM 服务管理](../management/llm-services.md) — 搜索模型和切换状态
- [聊天框](../components/chat.md) — 使用 `{ llmService, model }` 选择模型
