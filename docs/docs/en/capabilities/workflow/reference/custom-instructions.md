---
title: 'Custom nodes'
description: 'Provide reusable nodes and register consistent contracts for source validation, Artifact builds, and runtime.'
keywords: 'NocoBase,workflow,Agent'
---

# Custom nodes

Prefer installed nodes. Application calculations, CRUD, notifications, and external calls usually need only Run plus a typed Service. One email call alone does not justify a new Instruction. Consider one when:

- Multiple workflows need a reusable operation with its own validated configuration and results.
- You need flow-control semantics Run cannot express. Persistent waiting, approval, loops, and subflows require dedicated lifecycle support; a synchronously completed node alone does not provide it.

A custom node has three parts. The agent can follow the Skill’s complete example; check all three:

1. **Server Instruction class**: extend `WorkflowInstruction` from `@nocobase/app-plugin-workflow/server`; provide a unique `type`, `branches` (`null` for sequential nodes), synchronous `validateConfig()`, and asynchronous `run()`.
2. **Definition factory**: use `createNode()` from `@nocobase/app-plugin-workflow/dsl` to wrap a factory used with `addNode()` without loading server code in definitions.
3. **Registration**: call `workflow.registerInstruction(CustomInstruction)` in an application Provider’s `boot()`. Duplicate types are rejected.

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

Runtime registration alone is insufficient. Source validation and Artifact builds must use the same node types. Default `pnpm nocobase workflow check` recognizes only Run, Condition, and Terminate; rejecting a custom type does not mean the node is invalid. Use `checkWorkflowPackage()` and `buildApplicationWorkflows()` from `@nocobase/app-plugin-workflow/build` with the same contracts for built-in and extended nodes, validating configuration and branches. Development (`pnpm dev`) uses runtime-registered types and needs no extra configuration.

The Workflow Skill’s `references/custom-instructions.md` contains a complete runnable example: class, factory, Provider, validation, and build scripts.
