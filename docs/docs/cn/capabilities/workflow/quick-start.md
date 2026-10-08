---
title: '快速开始'
description: '运行 examples 模板自带的报价工作流，用两组输入体验条件分支、节点结果和执行记录。'
keywords: 'NocoBase,工作流,快速开始,报价,examples'
---

# 快速开始

本教程运行 `examples` 模板自带的报价工作流，体验“启用 → 手动运行 → 查看路径与结果”。使用两组固定输入即可看到不同分支，无需编写工作流或准备业务数据表。

示例按报价金额与管理员阈值比较，选择人工跟进或标准处理，最后汇总结果。它只记录分类结果和日志，不修改订单，也不会等待人工审批。

## 开始之前

准备一个基于 NocoBase 3 `examples` 模板创建的应用，使用 `pnpm dev` 启动，并以管理员身份登录。

还没有示例应用时，按[创建应用](../../get-started/create-app.md)准备目录和 Agent 会话，并在创建需求中指定：

```text
请使用 NocoBase 3 的 examples 模板创建并启动一个本地示例应用，我要体验模板自带的工作流。完成后告诉我访问地址和管理员登录方式。
```

已有 `default` 或 `hub` 模板应用时，不要为了本教程替换现有应用；可以另外创建示例应用，或直接进入[使用 Agent 开发](./development/index.md)实现自己的工作流。

## 1. 找到并启用示例

1. 进入“设置 → 自动化 → 工作流”；
2. 找到 **Example: Quotation routing**，工作流 key 为 `example-quotation-routing`；
3. 打开启用开关，进入工作流详情；
4. 从“更多操作 → 参数设置”确认 `Manual follow-up threshold in cents` 为 `100000`，已有其他设置时改为该值并保存。新应用默认值就是 `100000`。

金额和阈值的单位都是“分”。本教程的阈值 `100000` 相当于 `1000` 元，判断条件是金额**大于或等于**阈值。

流程图中的节点名称来自示例源码，显示为英文：

```text
Calculate quotation（计算报价）
  → At or above the review threshold?（是否达到阈值）
      ├─ 是 → Flag for manual follow-up（标记人工跟进）
      └─ 否 → Use standard processing（标准处理）
  → Summarize selected route（汇总所选路径）
```

## 2. 运行人工跟进分支

在工作流详情页，从“更多操作”选择“手动运行”，填写：

| 输入字段                          | 值       |
| --------------------------------- | -------- |
| `Quotation reference`（报价编号） | `Q-100`  |
| `Amount in cents`（金额，分）     | `150000` |

这里的 `Q-100` 只是示例标识，不需要创建真实报价记录。提交后页面进入本次执行详情；记录运行 ID，等待状态变为“已完成”。页面尚未显示结果时先查看执行记录，不要立即重复提交。

## 3. 查看路径和节点结果

在执行详情中，确认流程图经过了 `Flag for manual follow-up`，没有执行 `Use standard processing`。点击节点查看结果和日志：

- `Calculate quotation` 返回 `quotationId: 'Q-100'` 和 `totalCents: 150000`；
- Condition 的结果为 `true`；
- `Flag for manual follow-up` 返回 `route: 'manual-follow-up'`，并记录分类日志；
- `Summarize selected route` 返回汇总结果：

```json
{
  "quotationId": "Q-100",
  "totalCents": 150000,
  "route": "manual-follow-up"
}
```

“人工跟进”在这个示例中只是分类结论，流程会正常结束。

## 4. 运行标准处理分支

返回同一个工作流的详情页，再手动运行一次：报价编号仍为 `Q-100`，金额改为 `50000`，阈值保持 `100000`。

本次应产生另一条运行记录。对照两次结果：

| 金额（分） | Condition 结果 | 实际分支                    | 汇总中的 `route`   |
| ---------- | -------------- | --------------------------- | ------------------ |
| `150000`   | `true`         | `Flag for manual follow-up` | `manual-follow-up` |
| `50000`    | `false`        | `Use standard processing`   | `standard`         |

两次运行都应经过最后的 `Summarize selected route`。也可以从“设置 → 自动化 → 工作流执行”找到这两条记录，按运行 ID 分别查看。

## 常见问题

### 找不到报价示例

确认应用使用的是 `examples` 模板，且 `workflows/example-quotation-routing/workflow.ts` 存在。保持 `pnpm dev` 运行并刷新列表；其他模板不自带这个报价示例。

### 分支与本教程不一致

确认当前运行的输入金额和参数设置。已有运行使用创建时的参数快照，之后修改阈值不会改变历史结果。先把阈值设为 `100000`，再创建一次新运行核对。

### 运行没有完成或出现错误

记录运行 ID、版本、状态和错误，按[执行记录与诊断](./management/run-inspection.md)查看证据，或交给 Agent 诊断。

## 下一步

- [使用 Agent 开发](./development/index.md)：准备应用与 Skill，开始实现自己的业务工作流；
- [开发流程](./development/process.md)：以库存补货为例，描述需求、确认方案、实现并接入真实触发；
- [管理工作流](./management/index.md)：了解参数、版本、手动运行和执行记录的日常操作。
