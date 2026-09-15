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
  useAIChatController,
  useAIChatControllerState,
} from '@/extensions/nocobase-ai/providers';

function GlobalChatContent() {
  const controller = useAIChatController();
  const { open } = useAIChatControllerState(controller);
  const [expanded, setExpanded] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (!next) setExpanded(false);
    controller.setOpen(next);
  };

  return (
    <>
      {!open && <AIChatFloatingTrigger controller={controller} />}
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
    </>
  );
}

export function GlobalChat() {
  return (
    <AIChatProvider id='global-ai-chat'>
      <GlobalChatContent />
    </AIChatProvider>
  );
}
```

## 放到应用布局

把 Provider 和入口放在应用级 React Provider 或主布局中，只挂载一次。不要把它复制到每个页面，否则页面切换会产生多个全局入口和互不相干的 Controller。

桌面侧栏可以通过 `.chat-side-panel-layout` 和 `--chat-side-panel-width` 让主内容变窄，避免遮挡仍需操作的页面。移动端应改用覆盖式 Surface。入口打开时将悬浮按钮隐藏，关闭后再显示。

## 未读和默认员工

`AIChatFloatingTrigger.unreadCount` 可以展示未读数量。需要指定默认员工时，在 `AIChatProvider` 使用 `defaultEmployee`，不要在每次点击入口时创建新 Provider。

## 相关链接

- [快速开始](../quick-start.md) — 让编码 Agent 创建全局入口
- [聊天框](./chat.md) — 了解窗口与容器的职责
- [员工任务](./tasks.md) — 从业务页面打开指定员工和任务
