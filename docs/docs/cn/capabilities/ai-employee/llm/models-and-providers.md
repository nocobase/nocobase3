---
title: 'LLM 服务和模型'
description: '了解 ai.llmServices 的配置字段，以及如何为 AI 员工准备模型。'
keywords: 'LLM 服务,provider,enabledModels,modelOptions'
---

# LLM 服务和模型

`ai.llmServices` 是一个数组。每个服务至少需要 `name` 和 `provider`，模型通过 `enabledModels` 显式列出。

## 配置字段

| 字段            | 说明                                        |
| --------------- | ------------------------------------------- |
| `name`          | 稳定的服务名称，不能重复                    |
| `title`         | 管理后台显示名称                            |
| `provider`      | 已注册的 provider 名称                      |
| `options`       | provider 的连接配置，比如 API Key、base URL |
| `enabledModels` | 可选模型数组，每项包含 `label` 和 `value`   |
| `modelOptions`  | provider 或模型需要的额外配置               |
| `enabled`       | 是否启用服务                                |
| `sort`          | 服务在列表中的排序值                        |

## 使用自定义 API 地址

部分 provider 支持自定义 endpoint。把它放在对应 provider 支持的 `options` 中：

```yaml
ai:
  llmServices:
    - name: compatible-api
      title: Compatible API
      provider: openai
      options:
        apiKey: ${COMPATIBLE_API_KEY}
        baseURL: ${COMPATIBLE_API_BASE_URL}
      enabledModels:
        - label: Business Chat
          value: business-chat
```

具体的 option 名称以当前 provider 的声明为准。不要为了“试一下”在前端拼接 API 地址。

## 启用模型和员工模型限制

`enabledModels` 决定服务可提供的模型。管理员还可以在员工详情中设置模型范围：

- 不设置限制：员工可以使用应用中对当前用户开放的模型
- 设置一个模型：员工固定使用该模型
- 设置多个模型：员工只能在指定范围内选择

如果模型 ID 写错，服务可能可以显示，但调用时会返回 provider 错误。模型的 `value` 应该填写 provider 要求的原始 ID。

## 配置变更的影响

修改服务的 `name` 会让已有员工和会话找不到原服务。生产环境中应保持稳定名称，只调整 `title`、`options` 或模型列表。

停用服务前，先检查哪些员工正在使用它，并为这些员工选择其他可用模型。

## 相关链接

- [配置 LLM](./index.md) — LLM 配置流程
- [管理 AI 员工](../management/index.md) — 为员工选择模型
