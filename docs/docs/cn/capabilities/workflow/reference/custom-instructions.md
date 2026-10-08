---
title: '自定义节点'
description: '为多个工作流提供可复用节点，并统一源码检查、Artifact 构建和运行时的节点注册。'
keywords: 'NocoBase,工作流,Instruction,自定义节点'
---

# 自定义节点

优先使用已安装的节点。应用自己的计算、增删改查、发送通知或调用外部接口，用 Run 加类型化 Service 即可，一次邮件调用本身不需要新的节点类型。只有下面两种情况才考虑自定义节点（Instruction）：

- 多个工作流需要同一种可复用操作，并且它有自己需要校验的配置和结果；
- 需要 Run 无法表达的流程控制语义。注意，持久等待、审批、循环和子流程需要专门的生命周期支持，仅实现一个同步完成的节点并不能提供这些能力。

一个自定义节点由三部分组成，Agent 会按 Skill 中的完整示例实现，你只需确认这三部分都已到位：

1. **服务端 Instruction 类**：继承 `@nocobase/app-plugin-workflow/server` 导出的 `WorkflowInstruction`，提供唯一的 `type`、`branches`（顺序节点为 `null`）、同步的 `validateConfig()` 和异步的 `run()`；
2. **定义端工厂函数**：用 `@nocobase/app-plugin-workflow/dsl` 导出的 `createNode()` 包装一个工厂，让 `workflow.ts` 可以像内置节点一样通过 `addNode()` 添加它，同时不会在定义中加载服务端代码；
3. **注册**：在应用 Provider 的 `boot()` 中调用 `workflow.registerInstruction(CustomInstruction)`。重复的 type 会被拒绝。

```ts
// server/providers/workflow-instructions.ts
export default class WorkflowInstructionsProvider extends ServiceProvider<Application> {
  readonly name: string = 'workflow-instructions';

  async boot(): Promise<void> {
    const { LabelInstruction } =
      await import('../workflow-instructions/label.js');
    this.app.container
      .resolve(workflowServiceToken)
      .registerInstruction(LabelInstruction);
  }
}
```

只在运行时注册还不够：源码检查和 Artifact 构建也必须使用同一组节点类型。默认的 `pnpm nocobase workflow check` 只认识 Run、Condition 和 Terminate，它拒绝一个自定义节点并不说明该节点无效；使用自定义节点的工作流需要通过 `@nocobase/app-plugin-workflow/build` 的 `checkWorkflowPackage()` 和 `buildApplicationWorkflows()`，传入包含内置节点和所有扩展节点的同一组节点类型契约（用于校验节点配置和分支结构）。开发环境（`pnpm dev`）按运行时实际注册的节点校验，不需要额外配置。

完整的可运行示例（节点类、工厂、Provider、检查与构建脚本）在工作流 Skill 的 `references/custom-instructions.md` 中。
