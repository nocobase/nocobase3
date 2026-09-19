---
title: '快速开始'
description: '为 NocoBase 应用配置第一个 LLM 服务，并使用内置组件创建全局 AI 对话入口。'
keywords: 'NocoBase,AI 员工,快速开始,config.yml,LLM,全局对话'
---

# 快速开始

这条路径使用 NocoBase 内置的 AI 员工和前端组件，不要求你先编写自己的员工。完成 LLM 配置、确认模型和创建全局入口后，就可以开始对话。

## 前置条件

- 已使用 `pnpm create @nocobase/app <目录名>` 创建应用
- 应用可以通过 `pnpm dev` 启动
- `@nocobase/app-plugin-ai-employee` 已在应用的 Server 和 Client 插件列表中注册
- 已准备 LLM 服务的 API Key
- 当前账号可以访问 `/settings/ai`

## 创建应用

创建并进入应用目录：

```bash
pnpm create @nocobase/app ai-workspace
cd ai-workspace
```

创建命令会询问数据库等基础信息，并生成包含 `config.yml` 的完整应用源码。确认初始应用能够通过 `pnpm dev` 启动，然后继续配置 AI。

## 第一步：声明 LLM 服务

打开应用根目录的 `config.yml`，在 `ai.llmServices` 中添加服务。下面使用名为 `gpt` 的 OpenAI 服务，并把密钥留给环境变量注入。

```yaml
ai:
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
```

`name` 是 NocoBase 内部引用这个服务的稳定标识，`provider` 是内置 Provider 的注册名。`enabledModels[].value` 必须使用服务商接受的真实模型 ID；如果当前账号不能使用示例中的 `gpt-5.6`，请替换成实际可用的模型。

你也可以先不写 `enabledModels`：

```yaml
ai:
  llmServices:
    - name: gpt
      title: GPT
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabled: true
```

省略 `enabledModels` 后，服务使用 Provider 模型模式。服务启动后，再到管理页搜索并选择要开放的模型。

## 第二步：注入密钥并重启

临时测试可以在启动命令前设置环境变量：

```bash
OPENAI_API_KEY='sk-...' pnpm dev
```

也可以把 `OPENAI_API_KEY=sk-...` 写入应用根目录的 `.env` 文件。启动脚本会读取它，再把值提供给 AI 配置同步器。不要把真实密钥提交到 Git。修改后重启开发服务，确保进程读到新的环境变量和配置。

:::tip 为什么 `${OPENAI_API_KEY}` 可以使用

`config.yml` 本身没有通用的环境变量插值语法。`${NAME}` 在这里能生效，是因为 AI 员工插件同步 `ai.llmServices` 和 `ai.mcpServers` 时会递归展开这些值。变量不存在时会得到空字符串，调用通常会在 Provider 认证阶段失败。

:::

## 第三步：在管理页确认模型

打开 `/settings/ai`，切换到「LLM Service」。你应该能看到 `gpt` 服务、`OpenAI` Provider 和当前已启用模型。

![编辑 LLM 服务模型](https://static-docs.nocobase.com/20260914111142-ai-employee-llm-services.png)

如果配置里没有写 `enabledModels`，点击模型列前的编辑按钮，从 Provider 返回的模型列表中选择模型；也可以切换到手动输入，填写模型 ID 和显示名称。最后确认服务右侧的「Enabled」开关已经打开。

## 第四步：创建全局 AI 对话入口

开发模式下打开 `/dev/ai-components/floating`，这里展示了全局悬浮入口、右侧面板和对话框之间的组合方式。

![全局悬浮 AI 对话入口](https://static-docs.nocobase.com/20260914111142-ai-components-floating.png)

接下来把下面的任务交给应用里的编码 Agent。让它直接参考当前应用中的示例源码，不要重新实现聊天 Transport。

```text
参考 /dev/ai-components/floating 对应的现有组件和源码，在应用布局中创建一个全局 AI 对话入口。

要求：
- 检查 client/extensions/nocobase-ai；目录不存在时，从当前 AI Employee 插件安装 nocobase-ai Registry 项；
- 用 NocoBaseAIRootProvider 包装 AI UI，并在 client/react-providers.ts 中挂载一次；
- 在页面右下角显示 AIChatFloatingTrigger；
- 点击后用 ChatSurface 打开右侧对话面板，并允许展开为 dialog；
- 复用同一个 AIChatProvider、controller 和 AIChatWindow，切换容器时不要重建会话；
- 保留历史会话、Tool 审批、附件和断线恢复能力；
- 完成后运行应用的 lint、typecheck、test 和 build。
```

## 第五步：开始对话

刷新应用，点击右下角的 AI 图标。选择一个可用的 AI 员工和刚才启用的模型，然后发送一条消息。如果员工、模型、流式回答和会话历史都能正常显示，最小链路就已经打通。

遇到问题时按下面的顺序检查：

| 现象                          | 优先检查                                               |
| ----------------------------- | ------------------------------------------------------ |
| 「LLM Service」没有出现服务   | `config.yml` 的 YAML 缩进、`ai.llmServices` 和服务重启 |
| 服务存在但没有模型            | 编辑模型列表，或检查 `enabledModels` 中的模型 ID       |
| 调用返回认证错误              | 运行进程是否读到环境变量，Provider 是否与密钥匹配      |
| 看不到可用员工                | 员工是否启用，当前角色是否被允许使用该员工             |
| `/dev/ai-components/*` 不存在 | 当前是否为开发模式；Dev Route 不进入生产构建           |

## 相关链接

- [LLM 配置](./configuration/llm.md) — 查看全部 Provider 和配置字段
- [聊天框](./components/chat.md) — 了解聊天窗口的组件层次
- [全局对话入口](./components/floating.md) — 在应用级 Provider 中挂载悬浮入口
- [LLM 服务管理](./management/llm-services.md) — 在后台选择和启用模型
