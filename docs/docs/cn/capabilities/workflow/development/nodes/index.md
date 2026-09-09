---
title: '内置工作流节点'
description: '选择 NocoBase 3 工作流内置的 Run、Condition 和 Terminate 节点。'
keywords: 'NocoBase,工作流节点,Run,Condition,Terminate'
---

# 内置工作流节点

节点是工作流中具有独立业务意义、可以被记录和观察的步骤。不要把每次函数调用或数据库查询都拆成节点；一个节点内部可以通过类型化 Service 完成一项原子业务动作。

## 节点选择

| 目标                         | 节点      | 文档                             |
| ---------------------------- | --------- | -------------------------------- |
| 执行计算、数据操作或外部调用 | Run       | [Run 节点](./run.md)             |
| 根据布尔条件选择路径         | Condition | [Condition 节点](./condition.md) |
| 提前结束本次流程             | Terminate | [Terminate 节点](./terminate.md) |

这三种节点分别对应“做一件事”“决定走哪条路”和“到此结束”。应用可以通过其他插件扩展节点类型，但定义工作流前必须先确认目标应用实际注册了这些能力。

## 所有节点共有的字段

每个节点都具有稳定且全局唯一的 `key`，还可以提供面向管理界面的 `title` 和 `description`。`config` 由具体节点类型定义；`options.timeout` 可设置节点最长执行时间；`result` 描述后续节点可以引用的结果结构。

节点标题和描述可以随版本调整，`key` 应在业务含义不变时保持稳定，以便关联历史、诊断和结果引用。

## 当前能力边界

默认插件没有内置人工审批、持久化等待、循环、通知或子流程节点。Run 节点可以调用通知服务或其他业务服务，但不能凭空提供“暂停几天后恢复”这样的流程控制语义。

## 扩展节点能力

只有当一种缺失能力是可复用的流程控制语义时，才考虑实现自定义 Instruction。自定义能力必须同时交给源码检查器、Artifact 构建过程和运行时注册表。让应用 Agent 先使用 Workflow Skill 检查现有插件，参见[使用 Workflow Skill](../using-skill.md)和[Workflow Service API](../service-api.md)。
