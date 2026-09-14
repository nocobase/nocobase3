---
title: '聊天框'
description: '使用 AIChatProvider 和 AIChatWindow 创建嵌入式、侧栏或 Dialog 对话。'
keywords: 'AIChatProvider,AIChatWindow,ChatInline,ChatSurface,ChatSurfaceActions'
---

# 聊天框

`AIChatProvider` 拥有一个对话场景的状态，`AIChatWindow` 负责会话列表、消息、输入区、员工和模型选择。容器组件决定窗口放在页面中、侧栏里还是 Dialog 中。

## 创建嵌入式聊天

```tsx
import { AIChatWindow, ChatInline } from '@/extensions/nocobase-ai/components';
import { AIChatProvider } from '@/extensions/nocobase-ai/providers';

export function CustomerAssistant() {
  return (
    <AIChatProvider id='customer-assistant'>
      <ChatInline className='h-[640px] min-h-0'>
        <AIChatWindow enableAttachments />
      </ChatInline>
    </AIChatProvider>
  );
}
```

`id` 是场景标识，不是会话 ID。用户可以在同一个场景里创建多次会话，所以它应随页面结构保持稳定。不同聊天区域要使用不同 `id`。

## 选择员工和模型

可以给场景指定默认员工和网页搜索设置：

```tsx
<AIChatProvider
  id='customer-assistant'
  defaultEmployee='customer-success'
  webSearch={false}
>
  <ChatInline className='h-[640px] min-h-0'>
    <AIChatWindow />
  </ChatInline>
</AIChatProvider>
```

`AIChatProvider` 初始使用服务返回的第一个可用模型，用户可以通过 `AIChatWindow` 的模型选择器切换。需要为某个业务任务固定模型时，在 `AIEmployeeTask.model` 中使用 `{ llmService, model }`；`llmService` 是 `config.yml` 或 LLM 管理页中的服务 `name`，不是 Provider 名称。

## 扩展输入区

`AIChatWindow.composerActions` 可以增加页面元素选择、网页搜索或应用自己的输入区按钮。附件默认关闭，使用 `enableAttachments` 开启；实际文件保存在 AI 员工的附件存储中。

`onToolCallDecision` 只观察 AI Provider 已经处理完成的允许、拒绝或参数修改决定，适合记录审计或触发界面联动。不要在这个回调中重复执行 Tool。

## 切换容器

`ChatSurface` 支持 `side-panel` 和 `dialog`。切换时只改变 `variant`，让同一个 `AIChatWindow` 保持挂载：

```tsx
<ChatSurface
  open={open}
  variant={expanded ? 'dialog' : 'side-panel'}
  onOpenChange={setOpen}
  width={450}
>
  <AIChatWindow
    headerActions={
      <ChatSurfaceActions
        expanded={expanded}
        onExpandedChange={setExpanded}
        onClose={() => setOpen(false)}
      />
    }
  />
</ChatSurface>
```

## 相关链接

- [组件概览](./index.md) — 查看五种组件场景
- [全局对话入口](./floating.md) — 用悬浮按钮打开 Surface
- [页面上下文](./context.md) — 把当前业务数据交给聊天框
- [附件存储配置](../configuration/storage.md) — 配置上传文件保存位置
