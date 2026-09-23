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
      overrideEnabledModels: false
      modelOptions:
        temperature: 0.2
      enabled: true
      sort: 10
```

| 字段                    | 是否必填 | 说明                                                  |
| ----------------------- | -------- | ----------------------------------------------------- |
| `name`                  | 是       | 服务唯一标识，也是 `ModelRef.llmService` 的值         |
| `provider`              | 是       | 内置 Provider 注册键                                  |
| `title`                 | 否       | 管理页显示名称                                        |
| `options`               | 否       | Provider 连接参数，通常包含 `apiKey` 和可选 `baseURL` |
| `enabledModels`         | 否       | 自定义模式下开放的 `{ label, value }` 模型数组        |
| `overrideEnabledModels` | 否       | 是否每次启动都重新套用 `enabledModels`，默认 `false`  |
| `modelOptions`          | 否       | 传给模型客户端的默认参数                              |
| `enabled`               | 否       | 新服务首次同步时的初始启用状态                        |
| `sort`                  | 否       | 管理页排序值                                          |

省略 `enabledModels` 表示 Provider 模型模式，可以在管理页搜索 Provider 返回的模型。不过在管理页勾选之前，这个服务一个可用模型都没有——它不会出现在模型选择器里，也不会出现在 `ai:listAllEnabledModels` 的返回里。如果希望应用启动后就能直接聊天，配置时就把 `enabledModels` 写上。

配置文件中的标准写法始终是数组，不要在 YAML 中写数据库使用的 `{ mode, models }` 结构。

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

NocoBase 不维护内置模型目录，`value` 是否可用完全取决于服务商账号。上面的 `gpt-5.6` 是自定义模型示例，只有服务商实际接受这个 ID 时才能调用；否则应使用管理页「选择模型」实时拉取到的模型 ID，或把 `value` 改成账号真实可用的模型。

`enabledModels` 约束的是可选列表，不是访问控制边界。它决定管理页和聊天框的模型选择器列出哪些模型、`ai:listAllEnabledModels` 返回什么，以及调用方没有指定模型时回退到哪一个；列表为空的服务不会出现在选择器里。调用方显式指定模型时不会校验这个列表，所以直接调接口或 AI 员工里存着的未列出模型仍然可以运行。

## 同步行为

每次服务启动时，`ai.llmServices` 的名称集合是权威集合：新增名称会创建服务，保留名称会更新 Provider、标题、连接结构和排序，删除名称会移除相应配置服务。

**模型列表和 Enabled 状态不在更新范围内。** 它们被当作管理员的配置——匹配到已有服务时，以数据库里的值为准，`config.yml` 里的 `enabledModels` 和 `enabled` 会被忽略。所以这两个字段实际只在服务**第一次被创建**时生效。

:::warning 注意

如果第一次写错了模型 ID，之后改 `config.yml` 不会生效，也不会报错。这种情况要么去管理页改，要么给这个服务打开 `overrideEnabledModels`。

:::

### 让 config.yml 接管模型列表

给单个服务加上 `overrideEnabledModels: true`，它的 `enabledModels` 就会在每次服务启动时重新套用：

```yaml
ai:
  llmServices:
    - name: gpt
      provider: openai
      overrideEnabledModels: true
      enabledModels:
        - label: GPT-5.6
          value: gpt-5.6
```

这个开关按服务声明，默认 `false`，不写就是原来的行为。打开之后模型列表就以 `config.yml` 为准——管理页上对这个服务的模型改动会在下次服务启动时被覆盖，所以通常来说只在希望用配置文件管理模型清单时才打开。

开关只管模型列表。管理员在管理页关掉的服务不会因为重新套用模型列表被打开，Enabled 状态仍然以数据库为准。

另外，聊天框默认选中的是所有已启用服务按 `sort` 排序后的第一个模型。打开这个开关之后，`sort` 加上 `enabledModels` 的第一项就能决定默认模型；不打开的话，这个顺序取决于数据库里的现状。

## 配置验证

配置验证会在写数据库前完成。名称重复、字段类型错误、空 `name` / `provider`，或者 `overrideEnabledModels` 不是布尔值，都会拒绝整份快照，避免只同步一半。

## 相关链接

- [快速开始](../quick-start.md) — 配置第一个 OpenAI 服务
- [LLM 服务管理](../management/llm-services.md) — 搜索模型和切换状态
- [聊天框](../components/chat.md) — 使用 `{ llmService, model }` 选择模型
