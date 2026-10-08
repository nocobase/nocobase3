---
title: 'Terminate 节点'
description: '使用 Terminate 节点从主路径或条件分支中提前结束工作流。'
keywords: 'NocoBase,工作流,Terminate 节点,提前终止'
---

# Terminate 节点

Terminate 节点在保存自身记录后立即结束整个工作流运行，适合“不需要继续，但也不是代码异常”的业务出口。

## 定义终止节点

```ts
createTerminateInstruction({
  key: 'stopIncompleteProfile',
  title: '资料不完整，结束处理',
  description: '客户资料缺少必填项时结束本次处理，不开通账号。',
}).outcome('success');
```

`outcome()` 接受 `success`（默认）或 `failure`。`failure` 表示流程得出了明确的业务失败结论；处理函数抛出的异常属于执行错误，两者含义不同。

## 在条件分支中终止

```ts
const flow = source
  .addNode(
    createConditionInstruction({
      key: 'canContinue',
      title: '资料是否完整',
      description: '资料完整时继续开通账号，否则结束处理。',
    })
      .check(isProfileCompleteHandler)
      .no([
        createTerminateInstruction({
          key: 'stopIncompleteProfile',
          title: '资料不完整，结束处理',
          description: '资料不完整时成功结束，跳过后续所有步骤。',
        }).outcome('success'),
      ]),
  )
  .addNode(
    createRunInstruction({
      key: 'openAccount',
      title: '开通账号',
      description: '为资料完整的客户开通账号。',
    }).run(openAccountHandler),
  );
```

资料不完整时 `openAccount` 不会执行。Terminate 不是“退出当前分支”，而是结束整个工作流。

## 终止、失败和错误的区别

- 成功终止：流程按预期提前结束；
- 失败终止：流程得出业务失败结论；
- 执行错误：处理函数、模块、基础设施或业务调用抛出了异常。

Terminate 没有结果，也不能包含分支。它不会撤销之前已经提交的写入或外部调用。

## 常见问题

### 流程结束后，父 Condition 为什么仍显示 Pending

Terminate 在分支内部结束了整个流程，父 Condition 没有走完正常的收尾步骤，所以状态可能停在 Pending。结合 Terminate 节点和整体运行状态判断，这不是卡死。

### 应该主动终止还是抛出错误

预期的业务出口用 Terminate；处理函数无法完成承诺的动作或遇到意外情况时抛出异常。不要用成功终止掩盖真正的执行故障。
