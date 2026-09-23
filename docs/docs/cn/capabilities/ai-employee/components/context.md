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

`useAIForm` 只返回一个 ref。只注册表单并不会让它进入对话，同一页面上的聊天仍然看不到它。需要自己用 `createAIPageContextReference` 创建引用，再用 `AIPageContextScope` 包住表单和聊天：

```tsx
const formRef = useAIForm({
  id: 'order-form',
  title: 'Order form',
  fields: [{ name: 'customer', type: 'string', required: true }],
  getValues: () => form.getValues(),
  setValues: (values) => applyReactHookFormValues(form, values),
});
const formContext = useMemo(
  () => createAIPageContextReference({ id: 'order-form', title: 'Order form' }),
  [],
);

return (
  <AIPageContextScope context={formContext}>
    <form ref={formRef}>{/* Order fields */}</form>
    <OrderAssistant />
  </AIPageContextScope>
);
```

上下文里带着这个引用时，内置的 `formFiller` Tool 才会启用，不需要再写一个应用 Tool。`setValues` 只会收到已声明、可编辑且类型匹配的字段，`formFiller` 从不提交或保存表单。`applyReactHookFormValues` 从 `@/extensions/nocobase-ai/adapters/react-hook-form` 导入，它不在 Registry 的入口里。页面上有多个表单、一次只处理其中一个时，也可以不预先引用，让用户通过下文的手动选择挑出表单。

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

`useAIPageElementPicker` 可以让用户从已注册页面元素中选择一项，再通过 `useAIChat()` 返回的 `addWorkContext()` 加到输入区。`addWorkContext` 在聊天的上下文上，不在 Controller 上，所以调用 `useAIChat()` 的组件要位于对应的 `AIChatProvider` 之内，比如作为输入区的一个按钮：

```tsx
function PickPageElementButton() {
  const { addWorkContext } = useAIChat();
  const { picking, startPicking } = useAIPageElementPicker();

  return (
    <button
      type='button'
      disabled={picking}
      onClick={() => startPicking({ onSelect: addWorkContext })}
    >
      Pick page element
    </button>
  );
}
```

手动选择只影响当前正在编辑的消息，不会永久修改场景默认上下文。

## 安全边界

- 只序列化完成任务所需的最少字段
- 任何写操作继续经过 Tool 参数校验和权限检查
- 前端 Tool 的 `ASK` 决策不能代替服务端授权
- 不把 DOM、组件实例、函数或循环引用放入 `content`

## 相关链接

- [员工任务](./tasks.md) — 把上下文附加到任务
- [Tool 卡片](./tool-cards.md) — 渲染上下文 Tool 的执行状态
- [注册 Tool](../development/tool.md) — 实现服务端业务能力
