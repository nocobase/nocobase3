---
title: 弹窗路由规范评审
description: 应用与插件弹窗路由的使用规范、AI 开发流程及核心 API 设计
---

# 弹窗路由规范评审

本文用于评审最终方案，不代表功能已经实现。已确认的使用规则直接陈述；组件接口及核心 API 的具体形状标为提案，审核后实施。详细背景见[设计文档](app-dialog-routing-design.md)。

## 1. 目标与预期效果

业务弹窗成为页面的子路由，URL 表达当前页面和打开的弹窗层级。用户可以直接分享弹窗链接、刷新恢复，并通过浏览器前进后退切换层级。

例如从订单页面打开订单详情，再打开商品详情：

```text
订单页面 → 订单详情 Dialog → 商品详情 Drawer
/orders/detail/42/item-detail/7
```

三层内容同时保留。关闭商品详情返回订单详情，再关闭返回订单页面。直接访问上述 URL，也得到相同的页面结构。

应用和插件遵循同一标准，AI 按固定文件清单实现业务，不必为每个弹窗重新设计路由和关闭逻辑。简单提示、删除确认等短暂交互不使用路由。

## 2. 规范设计

### 路径

每个弹窗在直接父路由下追加“弹窗名称 + 按需使用的记录 ID”。静态名称使用小写字母和连字符，参数名使用有业务含义的 camelCase，同一条路径中不重复参数名。

| 场景 | 完整路径 |
| --- | --- |
| 新增订单 | `/orders/create` |
| 订单详情 | `/orders/detail/:orderId` |
| 订单中的商品详情 | `/orders/detail/:orderId/item-detail/:itemId` |
| 订单中的客户详情 | `/orders/detail/:orderId/customer-detail/:customerId` |

路径不包含 `/main` 等部署前缀。父页面的查询字符串在打开和关闭时原样保留；弹窗默认不新增查询参数，临时状态留在组件内部。

### 路由

使用递归 `children` 声明子路由，子路径相对于直接父路由。组件继续懒加载，解析结果保留树结构。

```ts
// 应用：client/routes.ts；插件：自己的 client/routes/ 声明文件
defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
    children: [
      {
        name: 'orderDetail',
        path: 'detail/:orderId',
        componentLoader: () => import('./pages/order-detail.js'),
        children: [
          {
            name: 'orderItemDetail',
            path: 'item-detail/:itemId',
            componentLoader: () => import('./pages/item-detail.js'),
          },
        ],
      },
    ],
  },
]);
```

`defineSettingsRoutes()` 同样允许页面拥有子路由，弹窗不配置 `navigation`，不显示在设置导航中。开发工具页面沿用相同方式，生产环境移除整棵开发路由子树。

父路由通过认证和权限检查后才渲染子路由。子级额外权限在此基础上继续检查，不能绕过父级。插件只给自己拥有的页面添加子路由，不支持向其他所有者的路由追加节点。

### Outlet

AI 在需要显示子路由的组件中手动放置 `Outlet`，框架和弹窗组件不自动插入。父页面保留自身内容，父弹窗将出口放在包装组件之外；没有子路由的叶子组件不需要出口。

```tsx
// client/pages/orders.tsx
import { Link, Outlet, useLocation } from 'react-router';

export default function OrdersPage() {
  const { search } = useLocation();
  return (
    <>
      <Link to={{ pathname: 'detail/42', search }}>订单 42</Link>
      <Outlet />
    </>
  );
}
```

```tsx
// client/pages/order-detail.tsx
import { Link, Outlet, useLocation } from 'react-router';
import { RouteDialog } from '../components/route-dialog.js';

export default function OrderDetail() {
  const { search } = useLocation();
  return (
    <>
      <RouteDialog title='订单详情'>
        <Link to={{ pathname: 'item-detail/7', search }}>商品 7</Link>
      </RouteDialog>
      <Outlet />
    </>
  );
}
```

示例省略数据加载和翻译，展示路由与组件的组合关系；`title` 等组件属性属于下述提案。交付给 AI 的 Skills 提供完整可运行版本。

### 弹窗组件

模板和需要弹窗的插件各自维护本地 `RouteDialog`、`RouteDrawer`，实现一致。Dialog 居中显示，Drawer 从侧边展开；统一默认样式、内容滚动、焦点和嵌套交互，外观跟随应用主题。插件不导入模板私有组件。

路由决定打开状态。包装组件统一处理关闭，业务组件只负责内容和业务操作。关闭最上层时导航到直接父路由，保留查询字符串，统一 `replace: true`，不依赖 `navigate(-1)`。嵌套时只有最上层响应关闭交互。

建议两种组件使用相同的精简接口，待审核：

| 属性 | 用途 |
| --- | --- |
| `title`、`description` | 标题与可选说明 |
| `children`、`footer` | 内容与可选操作区 |
| `className` | 面板尺寸及样式定制 |
| `closeOnEscape` | 是否允许 Esc 关闭，建议默认允许 |
| `closeOnOutsideClick` | 是否允许遮罩点击关闭，建议默认不允许 |

不提供独立的 `open` 状态。建议提供本地 `useRouteOverlayClose()`，让业务取消、保存成功与包装组件使用同一关闭逻辑：

```tsx
// client/pages/item-detail.tsx；属性及 Hook 为待审核提案
import { RouteDrawer } from '../components/route-drawer.js';
import { useRouteOverlayClose } from '../components/use-route-overlay-close.js';

export default function ItemDetail() {
  const close = useRouteOverlayClose();
  return (
    <RouteDrawer
      title='商品详情'
      footer={<button type='button' onClick={close}>关闭</button>}
    >
      商品详情内容
    </RouteDrawer>
  );
}
```

## 3. 如何引导 AI

把规范放进现有开发入口，而不是要求 AI 自行发现这份评审文档：

| 入口 | 内容 |
| --- | --- |
| 两套模板的开发 Skill | 增加“业务弹窗”任务入口，指向 `references/client-dialog-routes.md` |
| 插件开发 Skill 与路由文档 | 指向插件弹窗规范，明确插件自己的文件和组件归属 |
| 模板与插件的标准参考实现 | 提供一致的包装组件、关闭逻辑和验证方法 |

Skill 按固定步骤组织：判断弹窗类型 → 找到父路由 → 添加子路由 → 放置 `Outlet` → 复用包装组件 → 验证。

提供新增、详情、嵌套、设置页面和插件场景的完整示例，包含文件名、导入、路由声明和导航代码。示例必须经过实际验证；不把尚未实现的 API 写成可执行指令。Plugin Skills 仅补充该插件公开的使用方式，不承担插件私有源码开发说明。

## 4. AI 的修改范围与验收

标准能力落地后，一个业务弹窗通常只修改以下文件：

| 范围 | 修改内容 |
| --- | --- |
| 应用 `client/routes.ts` 或插件 `client/routes/` | 追加所属父路由的子路由 |
| 父页面或父弹窗 | 添加打开入口和 `Outlet` |
| 业务弹窗组件 | 使用本地包装组件实现内容与操作 |
| 本地翻译与业务测试 | 添加文案和验证 |

已有包装组件直接复用；插件首次需要时，按标准参考添加本地实现。普通业务开发不修改核心、应用 Shell、其他插件私有代码或已有插件注册。标准能力的首次实现则统一修改核心路由、两套模板、参考实现和 Skills。

AI 验收应关注可观察行为：

- 点击、链接直达和刷新都能显示正确的页面及弹窗层级。
- 关闭只退出当前层，父内容保留，查询字符串不变；前进后退与 URL 一致。
- 父页面无权限时无法进入弹窗，子层额外权限有效。
- Dialog、Drawer 及混合嵌套的焦点、Esc、滚动和窄屏表现正确。
- 设置弹窗不产生导航项，应用与插件行为一致。

行为修改先写针对性测试，确认失败后实现并验证通过；再运行受影响包的 lint、typecheck、test、build。标准实现同时验证两套模板，并用浏览器检查交互。交付说明记录验证结果和未完成项，不以文件存在或 Inspector 输出代替行为验收。

## 5. 核心 API 的目标设计

核心变化集中在 `@nocobase/app-client` 的路由声明、解析和消费协议，不新增弹窗 UI 导出。下表是建议审核的目标形态。

| API / 行为 | 目标设计 |
| --- | --- |
| `AppClientRouteDefinition`、`defineAppRoutes()` | 增加可选的递归 `children`，子节点使用相对路径 |
| `AppClientSettingsRoutePageDefinition`、`defineSettingsRoutes()` | 页面可声明子路由；弹窗子节点不提供 `navigation` |
| `isAppClientSettingsRouteGroup()` | 区分“导航分组”和“带 children 的页面”，不能仅根据 `children` 判定 |
| `AppClientRegisteredRoute`、`ResolvedAppRuntime.routes` | 根数组保留，每个节点携带递归的已解析子节点，不将层级打平 |
| 路由解析、覆盖与冲突检查 | 递归处理所有节点，保留归属与权限，覆盖组件不改变节点身份和父子关系 |
| Inspector、设置导航和开发路由消费方 | 遍历路由树；导航只读取导航节点，生产过滤覆盖整个开发子树 |

结构示意如下；具体类型名称和约束随审核确定：

```ts
// 声明：保留现有字段，补充子节点
interface AppClientRouteDefinition {
  // name、path、auth、access、componentLoader 等现有字段
  readonly children?: readonly AppClientRouteDefinition[];
}

// 解析：子节点也必须是已解析节点
interface AppClientRegisteredRoute {
  // id、packageName、source、auth 等现有解析字段
  readonly children?: readonly AppClientRegisteredRoute[];
}
```

模板路由渲染器递归生成 React Router `Route`，权限检查通过后渲染业务组件，由业务组件的 `Outlet` 连接下一层。设置页继续保留原导航分组语义；建议根据是否拥有 `componentLoader` 区分页面与分组，具体类型收窄需验证后确认。

实施前还需收口四项：路由名称唯一范围和 ID 规则、子节点 `auth` 的继承与类型限制、组件属性与关闭 Hook、路由模块未加载或权限被拒绝时的可关闭提示。最后一项不能直接依赖业务包装组件，因为它此时尚未挂载。

这些细节确认后，再修改核心与模板代码，并把经过验证的最终 API 写入开发 Skills。
