---
title: '聊天框'
description: '使用 AIChatProvider 和 AIChatWindow 创建嵌入式、侧栏或 Dialog 对话，并在配置就绪后再挂载聊天。'
keywords: 'AIChatProvider,AIChatWindow,ChatInline,ChatSurface,ChatSurfaceActions,useAI,defaultEmployee'
---

# 聊天框

`AIChatProvider` 拥有一个对话场景的状态，`AIChatWindow` 负责会话列表、消息、输入区、员工和模型选择。容器组件决定窗口放在页面中、侧栏里还是 Dialog 中。

## 等配置就绪再挂载

`NocoBaseAIRootProvider` 会异步加载员工和模型，但不会推迟渲染子组件。如果 `AIChatProvider` 在加载完成前就挂载，界面上显示的是回退默认值，内部的选择和 Transport 却还停留在空配置上，第一次发送会失败或什么都没用上。在已经挂载的聊天上盖一层加载遮罩解决不了这个问题，因为聊天已经在下面初始化了。

所以要在 `NocoBaseAIRootProvider` 下面用一个读取 `useAI()` 的组件把整个 `AIChatProvider` 子树挡住，等配置就绪再挂载。三个信号要分开检查：`configurationStatus` 是 `'ready'` 时模型加载仍可能失败，`models` 里也可能只有一个 `configured: false` 的占位项，所以单看状态或数组长度都不能证明聊天可以发送。

下面的组件放在应用自己的目录里，比如 `client/components/ai-chat-ready-gate.tsx`：

```tsx
import type { ReactNode } from 'react';
import { useAI } from '@/extensions/nocobase-ai/providers';

export function AIChatReadyGate({ children }: { children: ReactNode }) {
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  if (configurationStatus === 'loading') {
    return <p role='status'>Loading AI configuration...</p>;
  }
  if (configurationStatus === 'error') {
    return (
      <p role='alert'>
        {configurationError?.message ?? 'Unable to load AI configuration.'}{' '}
        Check your connection and AI settings, then reload this page.
      </p>
    );
  }
  if (!employees.length) {
    return <p role='alert'>No AI employees are available.</p>;
  }
  if (modelConfigurationError) {
    return (
      <p role='alert'>
        {modelConfigurationError.message} Check and enable a model in AI
        settings, then reload this page.
      </p>
    );
  }
  if (!hasEnabledModels) {
    return (
      <p role='alert'>
        No enabled AI model is available. Configure and enable a model in AI
        settings, then reload this page.
      </p>
    );
  }
  // 员工和模型都已就绪，这时才挂载聊天
  return children;
}
```

提示文字按应用的语言包本地化。配置出错后的恢复方式是修好配置再刷新页面，不要通过切换员工或模型、或者给聊天加 `key` 强制重新初始化——那样会丢掉会话状态。

## 创建嵌入式聊天

```tsx
import { AIChatWindow, ChatInline } from '@/extensions/nocobase-ai/components';
import { AIChatProvider } from '@/extensions/nocobase-ai/providers';
import { AIChatReadyGate } from '@/components/ai-chat-ready-gate';

export function CustomerAssistant() {
  return (
    <AIChatReadyGate>
      <AIChatProvider
        id='customer-assistant'
        defaultEmployee='customer-success'
      >
        <ChatInline className='h-[640px] min-h-0'>
          <AIChatWindow enableAttachments />
        </ChatInline>
      </AIChatProvider>
    </AIChatReadyGate>
  );
}
```

`id` 是场景标识，不是会话 ID。用户可以在同一个场景里创建多次会话，所以它应随页面结构保持稳定。不同聊天区域要使用不同 `id`。

## 选择员工和模型

`defaultEmployee` 填员工的 `username`，实际使用中不要省略。不传时聊天会打开 `employees[0]`，也就是所有已启用员工中 `sort` 最小的那个；内置的 `atlas` 员工 `sort` 是 `0`，所以为应用自己员工准备的页面会打开在 `atlas` 上。这种情况下就绪检查照样通过，第一次发送也能成功，看起来没有任何问题，只是对话的员工不对。

还可以给场景设置网页搜索：

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
