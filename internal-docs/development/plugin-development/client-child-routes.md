---
title: 插件页面子路由与导航
description: 在插件路由中声明页面、递归菜单分组和子路由，手动放置 Outlet 并验证访问行为。
---

# 插件页面子路由与导航

三类路由通过同一组页面与分组约定声明导航。插件修改自己的 `client/routes/` 或现有路由聚合文件，经 `client/plugin.ts` 的 routes contribution 进入应用，不向应用重复写入路径。

页面包含 name、path、componentLoader，可选 navigation、access 和 children。分组包含 name、navigation 和 children，可选 path，不包含 componentLoader。分组和页面都可以递归；无路径分组只组织菜单。

```ts
// client/routes.ts
import { defineAppRoutes } from '@nocobase/app-client/plugins';

export default defineAppRoutes([
  {
    name: 'business',
    navigation: { title: 'navigation.business' },
    children: [
      {
        name: 'orders',
        path: '/orders',
        navigation: { title: 'navigation.orders' },
        componentLoader: () => import('./pages/orders.js'),
        children: [
          {
            name: 'orderDetail',
            path: ':orderId',
            componentLoader: () => import('./pages/order-detail.js'),
          },
        ],
      },
    ],
  },
]);
```

Orders 页面手动放置 `<Outlet />`；详情组件 default-export，并通过 useParams 读取参数。导航使用 Link/NavLink，相对路径以当前路由为基准。父页面不放出口，子内容就不会显示；分组由路由层透传，不需要业务组件。

路径按业务自行设计，不限制名称与 ID 的格式。菜单只声明静态可访问目标，详情、Tab 通常不配置 navigation。菜单的 title 使用插件命名空间，icon 是组件类型而非 JSX 实例。App 菜单不再读取 Refine resource meta；CRUD 所需 resources 继续保留。

App 入口的认证与默认权限保持原约定。嵌套页面继承父链，只通过显式 access 增加权限。Settings、Dev 要求登录；父页面被拒绝时子页面不加载，导航也不能暴露绕过父级的入口。

修改范围：所属路由声明、父页面导航和 Outlet、子页面、翻译及 tests。只有首次贡献 routes 时修改 plugin.ts；已注册插件不需修改应用注册。组件覆盖仅替换页面 loader，必须保留需要的 Outlet；不支持跨所有者追加子节点。

完整页面与 Tab 代码可参照[应用子路由示例](../../../packages/templates/app-template-default/skills/nocobase-app-development/references/client-child-routes.md)，将文件放在插件自身 client 目录，文案归插件命名空间。不要导入模板私有组件。

验收直接访问、刷新、前进后退、父层保持、正确出口、菜单选中、权限拒绝和嵌套分组。新增行为先测试失败再实现；运行插件与目标应用的相关检查，Inspector 只作静态诊断。Dev 页面还要验证生产移除。
