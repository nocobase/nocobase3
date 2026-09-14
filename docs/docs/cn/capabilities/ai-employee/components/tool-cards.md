---
title: 'Tool 卡片'
description: '为 AI Tool 的审批、执行状态和结构化结果注册专用渲染组件。'
keywords: 'AIToolRendererProvider,ToolCallCard,Tool renderer,ASK,ALLOW'
---

# Tool 卡片

聊天窗口会用 `ToolCallCard` 呈现模型发起的 Tool 调用。通用卡片可以显示输入、执行状态、错误和结果；业务应用还可以按 `toolName` 注册专用 Renderer，把结构化结果呈现为选择器、图表、报告或工作流确认界面。

![Tool 卡片组件示例](https://static-docs.nocobase.com/20260914111142-ai-components-tools.png)

## Tool 调用状态

| 状态               | 界面含义                        |
| ------------------ | ------------------------------- |
| `input-streaming`  | 模型还在生成 Tool 参数          |
| `input-available`  | 参数完整，等待执行或用户审批    |
| `output-available` | Tool 已返回结果                 |
| `output-error`     | Tool 执行失败，展示可理解的错误 |

`ASK` Tool 在 `input-available` 时显示允许、拒绝或修改参数操作。Renderer 只负责交互和展示，审批决定仍交给 `AIChatProvider` 和 Transport 处理。

## 注册专用 Renderer

编辑应用安装的 AI Root Provider，把 Renderer 映射传给 `NocoBaseAIRootProvider.toolRenderers`。键必须是 Tool 注册名：

```tsx
<NocoBaseAIRootProvider
  toolRenderers={{
    suggestions: SuggestionsToolCard,
    businessReportGenerator: BusinessReportCard,
    chartGenerator: ChartToolCard,
  }}
>
  {children}
</NocoBaseAIRootProvider>
```

Renderer 必须能够显示历史消息中已经完成的 Tool part。不要只处理实时执行回调，否则刷新会话后卡片会变为空白。输入和输出都应先做运行时校验，再渲染可信字段。

## 什么时候使用专用卡片

- 结果需要用户从有限选项中继续选择
- 输出是图表、报告或结构化业务摘要
- Tool 委派给另一个员工，需要显示任务进度
- 工作流结果需要业务确认

简单文本或 JSON 结果继续使用通用卡片即可，不需要为每个 Tool 创建组件。

## 处理错误和审批

错误文案应描述可行动的原因，例如当前角色没有发布权限，而不是直接输出堆栈。带副作用的 Tool 默认使用 `ASK`；卡片可以改善确认体验，但不能把服务端的 ACL 和业务校验移到浏览器。

## 相关链接

- [注册 Tool](../development/tool.md) — 定义输入、执行和默认权限
- [页面上下文](./context.md) — 注册当前页面可用的前端 Tool
- [聊天框](./chat.md) — 观察 Tool 审批决定
- [MCP 服务管理](../management/mcp-services.md) — 调整 MCP Tool 权限
