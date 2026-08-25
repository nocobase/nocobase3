# 客户服务中心

NocoBase 3 原生服务台示例。它由 App Host 运行，业务数据保存在 App 自己的
`data/service-desk.json` 中，不依赖 NocoBase 2，也不与 CRM、订单 App 共用数据。

当前能力：

- 服务运营总览、SLA 风险和待办队列
- 工单创建、编辑、分派、回复与受控状态流转
- 客户联系人、服务目录和客服团队
- 服务端校验、SLA 计算与原子化数据写入
- 独立发布包、Release 历史和持久化数据目录

```bash
pnpm --filter @nocobase/app-service-desk check
pnpm --filter @nocobase/app-service-desk release:pack \
  --release-id release-service-desk-native-v1 \
  --output-root ../../packages/app-host/fixtures/app-dist
```
