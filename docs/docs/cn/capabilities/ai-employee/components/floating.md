---
title: '全局对话入口'
description: '使用 AIChatFloatingTrigger 和 ChatSurface 在应用中创建全局 AI 对话入口。'
keywords: 'AIChatFloatingTrigger,ChatSurface,AIChatProvider,AIChatWindow,global chat'
---

# 全局对话入口

全局对话入口通常位于应用右下角，点击后打开右侧面板，并允许用户展开为 Dialog。入口、Surface 和聊天窗口是三个独立层次：入口只负责打开，Surface 只负责容器，`AIChatWindow` 才是对话内容。

![全局悬浮 AI 对话入口](https://static-docs.nocobase.com/20260914111142-ai-components-floating.png)

## 基本组合

```tsx
import { useState } from 'react';
import {
  AIChatFloatingTrigger,
  AIChatWindow,
  ChatSurface,
  ChatSurfaceActions,
} from '@/extensions/nocobase-ai/components';
import {
  AIChatProvider,
  useAI,
  useAIChatController,
  useAIChatControllerState,
} from '@/extensions/nocobase-ai/providers';

const DEFAULT_EMPLOYEE = 'customer-success';

function GlobalChatContent() {
  // 在渲染 AIChatProvider 的组件里创建 Controller，并把它传给 Provider
  const controller = useAIChatController();
  const { open } = useAIChatControllerState(controller);
  const [expanded, setExpanded] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (!next) setExpanded(false);
    controller.setOpen(next);
  };

  return (
    <AIChatProvider
      id='global-ai-chat'
      controller={controller}
      defaultEmployee={DEFAULT_EMPLOYEE}
    >
      <AIChatFloatingTrigger
        controller={controller}
        aiEmployee={DEFAULT_EMPLOYEE}
      />
      <ChatSurface
        open={open}
        variant={expanded ? 'dialog' : 'side-panel'}
        onOpenChange={onOpenChange}
        width={450}
      >
        <AIChatWindow
          headerActions={
            <ChatSurfaceActions
              expanded={expanded}
              onExpandedChange={setExpanded}
              onClose={() => onOpenChange(false)}
            />
          }
        />
      </ChatSurface>
    </AIChatProvider>
  );
}

export function GlobalChat() {
  const {
    configurationStatus,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();

  // 员工和模型就绪之前不挂载聊天，全局入口在这段时间里不显示
  if (
    configurationStatus !== 'ready' ||
    !employees.length ||
    modelConfigurationError ||
    !hasEnabledModels
  ) {
    return null;
  }
  return <GlobalChatContent />;
}
```

`controller` 必须同时传给 `AIChatProvider`、`AIChatFloatingTrigger`，并用来读取 `open` 状态。如果在 Provider 的子组件里另外调用 `useAIChatController()` 而不传给 Provider，得到的是一个和聊天没有关联的新 Controller，入口发起的任务不会到达这个聊天。

悬浮按钮点击时会用自己的 `aiEmployee` 开启新会话；不传时用的是 `employees[0]`，而不是 Provider 的 `defaultEmployee`。所以两处都写上同一个员工的 `username`。`AIChatFloatingTrigger` 默认在面板打开时隐藏自己（`hideWhenOpen`），不需要再手动判断。

全局入口通常不需要显示加载和错误提示，上面的 `GlobalChat` 在配置没有就绪时直接不渲染。页面里的嵌入式聊天需要给用户明确的提示，写法见 [聊天框 · 等配置就绪再挂载](./chat.md#等配置就绪再挂载)。

## 放到应用布局

把 `GlobalChat` 放在应用级 React Provider 或主布局中，只挂载一次。它读取 `useAI()`，所以要位于 [`NocoBaseAIRootProvider`](./index.md#先装好运行时) 之内。不要把它复制到每个页面，否则页面切换会产生多个全局入口和互不相干的 Controller。

桌面侧栏可以通过 `.chat-side-panel-layout` 和 `--chat-side-panel-width` 让主内容变窄，避免遮挡仍需操作的页面。移动端应改用覆盖式 Surface。

## 未读和默认员工

`AIChatFloatingTrigger.unreadCount` 可以展示未读数量。默认员工通过 `AIChatProvider.defaultEmployee` 和 `AIChatFloatingTrigger.aiEmployee` 指定，不要在每次点击入口时创建新 Provider。

## 相关链接

- [快速开始](../quick-start.md) — 让编码 Agent 创建全局入口
- [组件概览](./index.md) — 挂载 `NocoBaseAIRootProvider`
- [聊天框](./chat.md) — 了解窗口与容器的职责，以及配置就绪检查
- [员工任务](./tasks.md) — 从业务页面打开指定员工和任务
