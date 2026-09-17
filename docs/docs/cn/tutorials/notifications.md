---
title: '5. 发通知'
description: '审批结果通过真实工作流投递到申请人的站内信。'
---

# 5. 发通知

现在把审批结果告诉申请人。先接站内信，无需配置真实邮箱或群机器人；申请人点击消息后回到那张订单。

## 本章目标与起点

上一章已经能提交、通过和驳回订单，并触发结果工作流。本章把消息接到这个真实事件上：正确的申请人收到通知，点击后到达正确订单，同一结果重复处理不会重复发消息。

## 一条通知需要哪些信息

| 信息         | 本例中的来源                     |
| ------------ | -------------------------------- |
| 什么时候发   | 主管的审批结果已经保存           |
| 发给谁       | 订单的申请人 `ownerId`           |
| 发什么       | 通过或驳回的结果，以及订单号     |
| 点击去哪里   | 这张订单的详情地址               |
| 如何判断重复 | 订单 ID 与审批版本组成的固定标识 |

站内信是用户之后仍能打开的消息记录。页面上短暂出现的“保存成功”提示只能反馈当前操作，不能代替通知。管理员查看投递记录，申请人查看自己的收件箱，两者用途也不同。

## 启用站内信

在应用的 `config.yml` 中合并下面的配置，保留其他渠道和配置项：

```yaml
notification:
  channels:
    - type: in-app
      enabled: true
      providers:
        - type: database
          name: default
```

确认通知、站内信和通知服务商插件已经注册；需要时使用应用提供的 `plugin:inspect` 检查。修改配置后重启开发服务，再确认渠道已经启用。渠道需要配置在 `config.yml` 中，`config.example.yml` 仅供参考。

## 接到审批结果工作流

```text
读取通知和站内信 Skill，扩展 tutorial-order-result 工作流的 Run 脚本。

根据 orderId 和 version 读取真实订单，只有 approved 或 rejected 状态才能发送。接收人是订单 ownerId；标题说明通过或驳回，正文包含订单号，actionUrl 为 /tutorial-orders/<订单ID>。

通过 options.services 解析已注册的 notificationServiceToken，调用 send()，不要直接写站内信表或绕过通知服务调用 Provider。channels 使用 ['in-app']，source.type 为 tutorial-order，source.referenceId 为订单 ID。

idempotencyKey 固定为 tutorial-order:<订单ID>:decision:<版本>，同一事件重复执行不能产生第二条通知。

增加正式应用路由 /tutorial-inbox 和“我的通知”菜单，复用站内信插件公开的 Provider 和 Inbox 组件及国际化命名空间，给业务员和主管权限。不要依赖仅开发环境可用的 /dev/notification-in-app 页面。

补充实际审批触发、接收人隔离、重复派发和服务不可用的检查。通知投递失败不能把已完成的审批改回未审批。
```

工作流脚本从 `options.services.resolve(notificationServiceToken)` 取得通知服务，调用形态如下。`order` 必须是经过当前订单 ID、版本和状态检查后读到的记录：

```ts
await notification.send({
  idempotencyKey: `tutorial-order:${order.id}:decision:${order.version}`,
  source: { type: 'tutorial-order', referenceId: order.id },
  to: { type: 'user', id: order.ownerId },
  channels: ['in-app'],
  content: {
    title: order.status === 'approved' ? '订单审批通过' : '订单审批驳回',
    body: order.number,
    actionUrl: `/tutorial-orders/${order.id}`,
  },
});
```

修改工作流后，重新检查并启用部署的当前版本，再用新订单验证。

## 查看真实通知

1. 用业务员创建并提交一张新订单。
2. 换主管账号完成审批。
3. 换回申请人，打开“我的通知”。
4. 确认消息里的订单号正确，点击后进入对应详情，刷新后仍能打开。
5. 换业务员乙登录，不能读取甲的通知。

![申请人在我的通知中收到订单审批结果](https://static-docs.nocobase.com/nb3-docs-20260916-tutorial-inbox.png)

管理员还可以进入“设置 → 通知 → 通知日志”，按来源查看投递与尝试记录。工作流成功不一定等于最终投递成功；确认通知整体状态、渠道、失败原因和下一次重试时间。`completed` 表示投递处理完成，不表示用户已经阅读。

## 检查重复与失败

主管对同一订单点击“补发审批结果”后，原事件只应对应一条业务通知。工作流的 `eventKey` 防止重复受理，通知的 `idempotencyKey` 防止重复创建，两层检查都要保留。

没有通知记录时，先查工作流是否启用、是否受理、Run 节点是否报错。日志长时间停在 `pending` 或 `processing` 时，再检查队列和工作进程。`unknown` 表示投递结果不确定，不能直接当作未发送而重复发送。

后续需要邮件或即时通讯时，再配置相应渠道、服务商和接收人解析。外部消息会真实发送，先用明确的测试地址验证。本教程使用站内信。

下一步：[上线](./deploy)。
