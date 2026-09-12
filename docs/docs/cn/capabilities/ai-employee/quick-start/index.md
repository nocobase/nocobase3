---
title: 'AI 员工快速开始'
description: '在源码中声明应用专属的 AI 员工，并在管理后台确认其已加载。'
keywords: 'NocoBase,AI 员工,快速开始,LLM,模型'
---

# 快速开始

完成以下步骤后，你可以在 NocoBase 中配置 LLM，在源码中声明 AI 员工，并在管理后台确认员工已加载。

## 前置条件

- 已创建一个可以运行的 NocoBase 应用
- 应用已启用 `@nocobase/app-plugin-ai-employee`
- 已准备 LLM 服务的 API Key
- 你拥有应用管理权限

## 第一步：在 `config.yml` 配置 LLM

在应用根目录的 `config.yml` 中添加 `ai.llmServices`。下面的示例使用 OpenAI，你也可以把 `provider` 换成已安装的其他 provider。

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
      enabled: true
      sort: 10
```

在启动应用前设置环境变量：

```bash
export OPENAI_API_KEY='你的 API Key'
pnpm dev
```

`enabledModels` 是提供给 NocoBase 的模型列表。`label` 用于界面显示，`value` 是实际发送给 provider 的模型 ID。

:::warning 注意

不要把 API Key 直接提交到 Git。推荐使用 `${OPENAI_API_KEY}` 这类环境变量占位符。

:::

## 第二步：在管理后台启用模型

进入管理后台的「AI 员工」设置，打开「LLM 服务」页签。

检查刚才配置的服务和模型：

1. 确认服务名称和 provider 正确
2. 找到要提供给 AI 员工使用的模型
3. 打开模型的「启用」开关
4. 保存配置

修改 `config.yml` 后需要重新加载应用配置。通常不需要重新扫描 `ai/` 资源；如果当前运行模式没有提供配置重载入口，可以重启开发服务。

## 第三步：在源码中声明 AI 员工

AI 员工不能通过管理界面创建，必须在应用源码的 `ai/employees/` 目录中使用 `defineAIEmployee` 声明。可以让 Agent 按照应用的业务目标创建员工定义，并完成加载检查。

员工定义通常包括：

- 员工名称和稳定的 `username`
- 员工简介和职责
- 默认模型或模型限制
- 可用技能和工具
- 是否启用

重新加载应用后，进入管理后台的「AI 员工」页签，确认源码中声明的员工已出现在列表中。

## 你应该看到什么

至此，应用已经具备：

- 一个可用的 LLM 服务
- 至少一个已启用模型
- 一个可以被聊天组件或业务页面调用的 AI 员工
- 一条可以继续配置技能、工具和模型限制的扩展路径

## 遇到问题先检查什么

| 现象               | 优先检查                                                     |
| ------------------ | ------------------------------------------------------------ |
| 模型列表为空       | `config.yml` 的缩进、provider 名称和 `enabledModels`         |
| 模型显示但调用失败 | API Key、网络访问和 provider 所需的其他 options              |
| AI 员工列表为空    | 插件是否启用、员工是否启用、当前用户是否有权限               |
| 修改配置后没有变化 | 是否重新加载了应用配置                                       |
| 前端聊天页面打不开 | `client/extensions/nocobase-ai` 是否已安装，插件路由是否正常 |

## 下一步

- [配置 LLM](../llm/index.md) — 了解多个 provider、模型和环境变量
- [声明 AI 员工](./create-employee.md) — 让 Agent 从源码生成员工定义
- [管理 AI 员工](../management/index.md) — 在后台维护员工和权限
