---
title: '在前端使用 AI 员工'
description: '使用 nocobase-ai Registry 在页面中接入聊天、员工快捷入口和页面上下文。'
keywords: 'nocobase-ai,AIChatProvider,AIChatWindow,NocoBaseAIRootProvider,AI 员工组件'
---

# 在前端使用 AI 员工

AI 员工的前端组件由 `packages/plugins/app-plugin-ai-employee/registry/nocobase-ai` 提供。应用安装后，Agent 应该编辑应用自己的 `client/extensions/nocobase-ai`，不要直接修改插件源码。

组件开发和管理都在 AI 员工相关页面中完成。前端开发时，可以先打开项目内置的 AI Chat Window 示例，观察聊天容器、员工选择器、模型选择器和工具交互，再在应用自己的 `client/extensions/nocobase-ai` 中复用组件。

## 先查看组件示例

AI Chat Window 示例用于比较内嵌区块、独立页面、侧边栏、对话框和移动端容器。它只用于观察组件组合方式，不需要重新实现会话历史、流式响应和工具审批。

## 嵌入聊天窗口

最小的聊天组件组合如下：

```tsx
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
} from './client/extensions/nocobase-ai';

export function CustomerSupportChat() {
  return (
    <NocoBaseAIRootProvider>
      <AIChatProvider
        id='customer-support-chat'
        defaultEmployee='customer-support'
      >
        <ChatInline>
          <AIChatWindow enableAttachments />
        </ChatInline>
      </AIChatProvider>
    </NocoBaseAIRootProvider>
  );
}
```

Registry 已经负责员工和模型发现、会话历史、文件上传、流式响应、工具审批和断线恢复。不要在页面组件中重新解析 SSE，也不要直接拼接 `/api/ai` 请求。

## 使用员工快捷入口

如果页面只需要一个按钮，可以让 Agent 使用 `AIEmployeeShortcut`：

```tsx
import { AIEmployeeShortcut } from './client/extensions/nocobase-ai';

export function SupportShortcut() {
  return (
    <AIEmployeeShortcut aiEmployee='customer-support' label='咨询客户支持' />
  );
}
```

需要用户确认任务内容时，使用 `auto: false`，让用户先检查上下文和提示词。

## 让员工读取页面上下文

页面上下文必须是可序列化的数据，例如订单号、客户名称和当前状态。不要把 DOM 节点、React 实例、回调函数或完整数据库对象直接交给 Agent。

```tsx
const orderContext = useAIPageElementHandle({
  id: 'order-detail',
  title: '订单详情',
  getContext: () => ({
    orderId: order.id,
    status: order.status,
  }),
});

return <section ref={orderContext.ref}>订单内容</section>;
```

如果员工需要修改业务数据，优先注册 `ASK` 权限的前端工具，并在执行时再次检查当前页面状态。

## 前端开发检查清单

- 使用应用安装的 `client/extensions/nocobase-ai`
- 每个 `AIChatProvider` 使用稳定且唯一的 `id`
- 上下文只包含可序列化、且当前用户有权看到的数据
- 持久化、导航和业务写操作使用 `ASK`
- 不在浏览器代码中放 API Key
- 让 Agent 验证聊天、历史、审批和断线恢复

## 相关链接

- [声明 AI 员工并添加技能和工具](./resources.md) — 准备聊天使用的资源
- [扩展 AgentService](./runtime.md) — 需要服务端直接调用时使用
- [管理 AI 员工](../management/index.md) — 确认员工和模型已启用
