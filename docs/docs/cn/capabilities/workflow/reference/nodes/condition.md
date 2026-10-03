---
title: 'Condition 节点'
description: '使用 Condition 节点根据输入、参数或上游节点结果选择执行路径。'
keywords: 'NocoBase,工作流,Condition 节点,分支'
---

# Condition 节点

Condition 节点执行一个随工作流包发布的判断函数：返回 `true` 进入 `yes` 分支，返回 `false` 进入 `no` 分支。它用于表达明确的业务决策，不负责写入数据。

## 定义条件与分支

```ts
import type { run as needsReplenishment } from './server/needs-replenishment';

createConditionInstruction({
  key: 'needsReplenishment',
  title: '是否需要补货',
  description: '缺口数量大于 0 时创建补货记录，否则记录库存充足。',
})
  .check(
    defineHandler<typeof needsReplenishment>('./server/needs-replenishment'),
  )
  .yes([createReplenishment])
  .no([recordStockSufficient]);
```

`createReplenishment` 和 `recordStockSufficient` 是预先创建好的 Run 节点。两个分支都可以省略，省略或传入空数组表示该分支没有额外步骤。也可以用 `.branch({ yes: [...], no: [...] })` 一次声明两个分支。

Condition 本身有一个布尔结果，后续节点可以通过 `nodeResults.needsReplenishment` 读取它选择了哪个分支。

## 编写判断函数

判断函数命名导出为 `run`，接收 `{ input, parameters, nodeResults }` 三个只读快照，必须返回布尔值（或返回布尔值的 Promise）：

```ts
// server/needs-replenishment.ts
import type { FlowContext } from '../workflow';

export function run({ nodeResults }: FlowContext): boolean {
  const shortage = nodeResults.calculateShortage;
  return shortage !== undefined && shortage.quantity > 0;
}
```

上游结果可能尚未产生，必须处理 `undefined`；结果类型由上游处理函数的返回类型推导，不需要手写。

判断逻辑是普通 TypeScript，和工作流包的其余代码一起做类型检查，可以单独写单元测试，没有表达式语言的限制。代价是阅读判断规则需要打开对应模块，所以应在节点 `description` 中写清规则。

## 分支后的共同后继

Condition 之后的同级节点是两个分支的共同后继：选中的分支走完后继续执行它，未选中的分支不会运行。如果选中的分支中执行了 Terminate，整个流程立即结束，不再执行共同后继。

## 常见问题

### 为什么判断函数必须返回布尔值

分支只有“是”和“否”两种语义。返回数字、字符串或 `null` 会让节点报错，不会按 JavaScript 的真假值隐式转换。

### 为什么流程进入了意外的分支

查看该次运行保存的输入快照、参数快照和 Condition 节点的结果，不要用当前设置推断历史运行；再打开该版本中的判断模块确认逻辑。

### 为什么一个分支读不到另一个分支的结果

两个分支不会同时执行，一次运行中另一个分支的结果必然不存在。类型上允许读取，运行时得到的是 `undefined`。
