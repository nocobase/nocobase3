---
title: '节点概览'
description: '选择 NocoBase 3 工作流内置的 Run、Condition 和 Terminate 节点。'
keywords: 'NocoBase,工作流节点,Run,Condition,Terminate'
---

# 节点概览

节点是工作流中具有独立业务意义、可以被记录和观察的步骤。不要把每次函数调用或数据库查询都拆成节点；一个节点内部可以通过类型化 Service 完成一项完整的业务动作。

## 内置节点

| 目标                         | 节点      | 创建方式                                         | 文档                             |
| ---------------------------- | --------- | ------------------------------------------------ | -------------------------------- |
| 执行计算、数据操作或外部调用 | Run       | `createRunInstruction(...).run(handler)`         | [Run 节点](./run.md)             |
| 根据布尔判断选择路径         | Condition | `createConditionInstruction(...).check(handler)` | [Condition 节点](./condition.md) |
| 提前结束本次流程             | Terminate | `createTerminateInstruction(...).outcome()`      | [Terminate 节点](./terminate.md) |

三种节点分别对应“做一件事”“决定走哪条路”和“到此结束”。

## 所有节点共有的字段

每个节点都接受 `key`、`title` 和 `description`：

- `key`：在整个工作流内全局唯一且保持稳定，用于关联历史记录、诊断和节点结果；
- `title`：流程图上显示的名称；
- `description`：节点的业务目的、实际逻辑和副作用，管理员点击节点时可以看到。每个节点都应填写。

标题和说明可以随版本调整，key 应在业务含义不变时保持不变。

## 扩展节点能力

普通业务动作优先使用 Run 加 Service。只有当多个工作流需要同一种带独立配置的可复用操作，或者需要 Run 无法表达的流程控制语义（例如审批、等待）时，才考虑自定义节点。自定义节点必须同时提供给源码检查、Artifact 构建和运行时，见[自定义节点](../custom-instructions.md)。

使用其他插件提供的节点前，先让 Agent 确认目标应用确实安装并注册了它。
