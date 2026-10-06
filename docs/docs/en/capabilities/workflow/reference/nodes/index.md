---
title: 'Node overview'
description: 'Choose the built-in Run, Condition, and Terminate workflow nodes.'
keywords: 'NocoBase,workflow,Agent'
---

# Node overview

A node is a meaningful business step that can be recorded and observed. Do not make every function call or query a node; one node can use a typed Service to complete an entire business action.

## Built-in nodes

| Goal                                                 | Node      | Factory                                          | Reference                   |
| ---------------------------------------------------- | --------- | ------------------------------------------------ | --------------------------- |
| Calculate, operate on data, or call external systems | Run       | `createRunInstruction(...).run(handler)`         | [Run](./run.md)             |
| Select a path using a boolean decision               | Condition | `createConditionInstruction(...).check(handler)` | [Condition](./condition.md) |
| End the process early                                | Terminate | `createTerminateInstruction(...).outcome()`      | [Terminate](./terminate.md) |

They mean “Do an action”, “Choose a path”, and “End here”.

## Shared fields

Each node accepts `key`, `title`, and `description`:

- `key`: unique across the workflow and stable, linking history, diagnostics, and results.
- `title`: label shown in the diagram.
- `description`: business purpose, logic, and side effects, shown when an administrator clicks the node. Provide it for every node.

Titles and descriptions can change by version. Keep keys when business meaning is unchanged.

## Extend node capabilities

Use Run plus a Service for ordinary actions. Consider custom nodes only for reusable operations with their own configuration or flow-control semantics such as waiting or approval. Register them consistently for source validation, Artifact builds, and runtime; see [Custom nodes](../custom-instructions.md).

Before using another plugin’s nodes, have the agent confirm that the application installs and registers them.
