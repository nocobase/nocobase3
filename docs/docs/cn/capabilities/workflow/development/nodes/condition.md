---
title: 'Condition 节点'
description: '使用 Condition 节点根据输入、参数或前置节点结果选择执行路径。'
keywords: 'NocoBase,工作流,Condition 节点,JSON Logic'
---

# Condition 节点

Condition 节点计算一个布尔表达式，结果为 `true` 时进入 `yes`，为 `false` 时进入 `no`。它适合表达明确的业务决策，不负责执行数据写入。

## 定义条件与分支

```ts
ConditionInstruction.create({
  key: 'needsApproval',
  title: '是否需要人工处理',
  config: {
    expression: {
      '>': [
        { var: 'nodeResults.calculateRisk.score' },
        { var: 'parameters.approvalLimit' },
      ],
    },
  },
}).branch({
  yes: [
    RunInstruction.create({
      key: 'recordManualReview',
      config: { module: './server/record-manual-review' },
    }),
  ],
  no: [
    RunInstruction.create({
      key: 'recordAutoApproval',
      config: { module: './server/record-auto-approval' },
    }),
  ],
});
```

省略 `expression` 时条件默认为 `true`。条件本身有内置布尔结果，因此后续节点可以通过 `{{$nodeResults.needsApproval}}` 引用选择结果。

## 支持的表达式

当前支持以下 JSON Logic 操作符：

```text
and  or  !  ===  !==  >  >=  <  <=  in  var  startsWith  endsWith
```

变量根只有 `input`、`parameters` 和 `nodeResults`。数值和字符串比较必须使用相同类型。表达式有深度、节点数、数组长度和变量路径长度限制，以避免不受控计算。

## 分支结束后的共同后继

Condition 后面同级的节点是两个分支的共同后继。选中的分支走完后会继续执行它；未选中的分支不会运行。分支可以是空数组。

如果选中分支中执行了 Terminate，则整个流程立即结束，不会回到共同后继。

## 示例：库存补货

```ts
ConditionInstruction.create({
  key: 'needsReplenishment',
  title: '是否需要补货',
  config: {
    expression: {
      '>': [{ var: 'nodeResults.calculateShortage.quantity' }, 0],
    },
  },
}).branch({
  yes: [createReplenishment],
  no: [recordStockSufficient],
});
```

`calculateShortage` 必须位于条件之前，并声明包含数值 `quantity` 的结果 Schema。

## 常见问题

### 为什么条件表达式必须返回布尔值

分支选择只有 yes/no 两种语义。返回数字、字符串或 `null` 会报错，不会按 JavaScript truthy/falsy 隐式转换。

### 为什么流程进入了意外分支

查看该次运行保存的输入快照、参数快照和 Condition 节点结果，不要用当前设置推断历史运行。还要确认比较双方类型一致。

### 为什么一个分支不能读取另一个分支的结果

工作流采用树形词法可见性。兄弟分支并不同时执行，允许跨分支引用会让结果在某些路径上不存在。
