# 订单运营中心

NocoBase 3 原生订单管理示例。它由 App Host 运行，数据保存在 App 自己的
`data/orders.json` 中，不依赖 NocoBase 2。

当前能力：

- 订单总览、状态分布和最近订单
- 订单创建、编辑、删除与受控状态流转
- 客户和商品档案
- 服务端金额计算、状态校验与原子化数据写入
- 独立发布包和持久化数据目录

```bash
pnpm --filter @nocobase/app-orders check
pnpm --filter @nocobase/app-orders release:pack \
  --release-id release-orders-native-v1 \
  --output-root ../../packages/app-host/fixtures/app-dist
```
