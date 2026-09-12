---
title: '在 config.yml 中配置 LLM'
description: '使用 ai.llmServices 声明 LLM 服务、API Key 和可用模型。'
keywords: 'config.yml,ai.llmServices,LLM,OpenAI,DeepSeek'
---

# 在 `config.yml` 中配置 LLM

AI 员工需要一个可用的 LLM 服务。NocoBase 通过应用根目录的 `config.yml` 读取服务配置，`ai.llmServices` 中的每一项对应一个服务。

## 最小配置

```yaml
ai:
  llmServices:
    - name: openai
      title: OpenAI
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        - label: GPT-4.1
          value: gpt-4.1
```

其中：

- `name` 是服务的稳定名称，创建会话时会作为 `llmService` 使用
- `title` 是管理界面中的显示名称
- `provider` 必须是应用中已注册的 provider 名称
- `options` 放 provider 所需的连接参数
- `enabledModels` 定义模型选择器里显示的模型

## 同时配置多个服务

你可以在同一个 `ai.llmServices` 数组中配置多个服务：

```yaml
ai:
  llmServices:
    - name: openai
      title: OpenAI
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        - label: GPT-4.1
          value: gpt-4.1
    - name: deepseek
      title: DeepSeek
      provider: deepseek
      options:
        apiKey: ${DEEPSEEK_API_KEY}
      enabledModels:
        - label: DeepSeek Chat
          value: deepseek-chat
```

## `provider` 可以填写什么

`provider` 必须使用当前应用已注册的值。NocoBase 内置以下常用 provider：

| `provider` 值        | 服务商                  | 适合场景                                   |
| -------------------- | ----------------------- | ------------------------------------------ |
| `openai`             | OpenAI Responses API    | OpenAI 模型和兼容 Responses API 的服务     |
| `openai-completions` | OpenAI Chat Completions | 使用 Chat Completions 协议的服务           |
| `anthropic`          | Anthropic               | Claude 系列模型                            |
| `deepseek`           | DeepSeek                | DeepSeek 系列模型                          |
| `dashscope`          | 阿里云 DashScope        | 通义系列模型和相关服务                     |
| `google-genai`       | Google Generative AI    | Gemini 系列模型，也支持部分 embedding 模型 |
| `kimi`               | Kimi                    | Kimi 系列模型                              |
| `mimo`               | MiMo                    | MiMo 系列模型                              |
| `mistral`            | Mistral AI              | Mistral 系列模型和 embedding               |
| `ollama`             | Ollama                  | 本地运行的模型                             |
| `xai`                | xAI                     | Grok 系列模型                              |
| `orcarouter`         | OrcaRouter              | 通过路由服务选择模型                       |
| `shengsuanyun`       | SSYCloud                | 使用算力云提供的模型服务                   |

如果应用安装了其他插件并注册了自定义 provider，也可以使用该 provider 的注册名。`provider` 值不是模型名；模型名写在 `enabledModels[].value` 中。

## 使用 `.env` 保存密钥

除了直接在终端设置环境变量，也可以把变量写入应用根目录的 `.env` 文件：

```dotenv
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...
```

`config.yml` 继续使用占位符：

```yaml
options:
  apiKey: ${OPENAI_API_KEY}
```

应用启动时会读取 `.env` 中的变量，并替换配置中的 `${NAME}`。`.env` 只适合本地开发或个人测试，生产环境建议使用部署系统的 Secret。确认 `.env` 已加入 `.gitignore`，不要将真实 API Key 提交到 Git。

如果员工需要固定使用某个服务和模型，可以在管理后台的员工配置中指定对应的模型设置；如果只需要让用户选择模型，保留多个服务并在前端显示模型选择器即可。

## 环境变量和密钥

配置值支持 `${NAME}` 占位符。开发环境可以这样设置：

```bash
export OPENAI_API_KEY='sk-...'
export DEEPSEEK_API_KEY='...'
```

生产环境则使用部署系统的 Secret 或环境变量注入。不要把真实密钥写入 `config.yml`、员工提示词或前端代码。

## 配置修改何时生效

修改配置后重新加载应用配置。配置同步会校验服务名称、provider 和模型列表：

- `name` 不能重复
- `provider` 不能为空
- `enabledModels` 的 `label` 和 `value` 应该是非空字符串
- 现有服务的管理状态会尽量保留
- 新服务会使用配置中的启用状态和模型列表

:::tip 推荐做法

先在 `config.yml` 中声明服务和模型，再在管理后台决定哪些模型真正对用户开放。这样源码配置负责连接信息，后台配置负责日常启用和停用。

:::

## 下一步

- [AI 员工快速开始](./index.md) — 从配置到第一次调用
- [管理 AI 员工](../management/index.md) — 设置员工默认模型和可用能力
