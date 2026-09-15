---
title: '页面上下文'
description: '使用 useAIPageElement、useAIForm 和 AIPageContextScope 把当前业务上下文提供给 AI 员工。'
keywords: 'useAIPageElement,useAIForm,AIPageContextScope,workContext,frontend tool'
---

# 页面上下文

页面上下文让 AI 员工理解用户正在查看的记录、表格或表单，并且只在对应页面生命周期内提供相关前端 Tool。上下文是一份可序列化快照，不是让 Agent 随意访问整个 React 树。

![页面上下文组件示例](https://static-docs.nocobase.com/20260914111142-ai-components-context.png)

## 注册页面元素

```tsx
const customerRef = useAIPageElement({
  id: 'customer-detail',
  title: `${customer.id} · ${customer.name}`,
  kind: 'record-detail',
  getContext: () => ({
    resource: 'customers',
    record: customer,
  }),
});

return <section ref={customerRef}>{/* Customer detail */}</section>;
```

`id` 是公开 React API 使用的稳定上下文 ID，不是 Flow Model UID。`getContext` 在需要时读取最新数据，因此不要在外部预先保存可能过期的对象。

## 注册表单

`useAIForm` 适合让 AI 读取或协助填写当前表单。只暴露业务需要的字段和操作，密码、Token、隐藏管理字段和不可编辑值不要进入上下文。

页面上下文和前端 Tool 都必须跟随组件卸载自动注销。不要在模块顶层注册页面资源，也不要把一次页面访问留下的 Tool 暴露给后续页面。

## 限定一个场景的上下文

```tsx
<AIPageContextScope
  context={{
    type: 'page-element',
    id: 'customer-detail',
    title: `${customer.id} · ${customer.name}`,
  }}
>
  <CustomerDetail />
  <AIEmployeeShortcut aiEmployee='customer-success' tasks={[analyzeCustomer]} />
</AIPageContextScope>
```

Scope 中没有写显式 `message.workContext` 的 Shortcut 或 `AIChatProvider` 会继承这份上下文。上下文解析失败时应阻止发送并显示错误，不能静默丢掉上下文后继续请求。

## 手动选择页面元素

`useAIPageElementPicker` 可以让用户从已注册页面元素中选择一项，再通过当前聊天 Controller 的 `addWorkContext()` 加到输入区。手动选择只影响当前正在编辑的消息，不会永久修改场景默认上下文。

## 安全边界

- 只序列化完成任务所需的最少字段
- 任何写操作继续经过 Tool 参数校验和权限检查
- 前端 Tool 的 `ASK` 决策不能代替服务端授权
- 不把 DOM、组件实例、函数或循环引用放入 `content`

## 相关链接

- [员工任务](./tasks.md) — 把上下文附加到任务
- [Tool 卡片](./tool-cards.md) — 渲染上下文 Tool 的执行状态
- [注册 Tool](../development/tool.md) — 实现服务端业务能力
