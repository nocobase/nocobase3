---
title: App 弹窗路由规范
description: 应用与插件业务弹窗的子路由、嵌套导航、默认组件与 AI 开发文件范围
---

# App 弹窗路由规范

## 文档状态

本文是规范设计稿，尚未实现。已确认使用递归子路由、解析结果保留树结构、由 AI 手动放置 `Outlet`，关闭时导航到直接父路由并统一使用 `replace`。应用和插件遵循相同规范；不支持跨所有者追加子路由。

`RouteDialog`、`RouteDrawer` 暂定由两套应用模板及需要它们的插件各自维护本地实现，实现保持一致。组件源码由各自的模板或插件拥有，`@nocobase/app-client` 负责通用子路由声明和解析。

本文的组件属性、关闭调用 API 和尚未确认的细节属于设计提案，需审核后实现。本阶段只修改设计文档，不修改核心、模板或开发 Skills。

## 目标与范围

AI 在页面中实现业务弹窗时，统一在当前页面路由下声明弹窗子路由。URL 表达当前打开的页面和弹窗层级，使链接直达、刷新恢复、浏览器前进后退具有一致行为。

两套模板提供本地通用路由弹窗组件，插件也可维护相同的本地实现，统一样式和基础交互。AI 默认复用，用户要求定制时可以调整样式，但仍遵循同一套路由和关闭规则。

简单提示、操作确认等短暂交互不需要路由。例如删除前的确认框、提交成功提示，继续使用普通交互组件。新增、编辑、详情和承载业务流程的选择弹窗属于路由弹窗。判断依据是弹窗是否承载业务页面，而不是尺寸或是否包含按钮。

本规范同时面向应用开发和插件开发。应用页面与插件页面中的业务弹窗遵循相同的路径、嵌套、导航、恢复和交互规则，区别在于路由声明、业务组件与开发指引的所有权。插件通过现有 Client Route contribution 提供弹窗子路由，不另建插件专属的弹窗注册机制；核心只处理通用路由关系，不依赖业务插件的内容。

## 路径规范

### 当前页面下的弹窗

有记录 ID 的弹窗使用以下完整路径：

```text
/parentPath/dialogPathName/:recordId
```

没有记录 ID 的弹窗省略参数段：

```text
/parentPath/dialogPathName
```

ID 可选是指按业务场景选择是否声明 ID，不要求所有路由都使用 `:id?`。新增弹窗不生成临时 ID 来满足路径格式。

| 场景 | 完整路径 |
| --- | --- |
| 订单页面 | `/orders` |
| 新增订单 | `/orders/create` |
| 订单详情 | `/orders/detail/:orderId` |
| 编辑订单 | `/orders/edit/:orderId` |
| 订单详情中的商品详情 | `/orders/detail/:orderId/item-detail/:itemId` |
| 订单详情中的客户详情 | `/orders/detail/:orderId/customer-detail/:customerId` |

`dialogPathName` 使用表达弹窗业务含义的名称，使用小写字母，多词用连字符分隔（kebab-case），例如 `item-detail`、`customer-detail`。每个弹窗追加一个名称段，需要记录时再追加一个参数段，不拆成 `items/detail` 等额外层级。路由声明与所有导航入口保持相同的拼写和大小写，不依赖路由器的大小写宽容匹配。

参数名表达记录含义。同一条嵌套路由链使用不同参数名，避免多个 `:id` 相互覆盖。相同实体出现多层时，也要通过角色区分参数名。

### 嵌套关系

嵌套弹窗声明在直接父弹窗下面，而不是声明成独立的顶层页面：

```text
/orders
├── create
└── detail/:orderId
    ├── item-detail/:itemId
    └── customer-detail/:customerId
```

在订单详情中打开商品详情时，订单页面和订单详情保持挂载，商品详情显示在最上层。从订单页面直接打开商品详情，则应声明在订单页面下；不能因为复用同一个组件就使用错误的父路由。

路由路径是应用内部路径，不包含部署前缀。应用部署在 `/main` 时，由现有路由运行环境补齐该前缀，业务代码不硬编码 `/main`。

## 导航与恢复

| 操作 | 规定行为 |
| --- | --- |
| 打开业务弹窗 | 导航到所属子路由，增加历史记录 |
| 打开嵌套弹窗 | 导航到当前弹窗的子路由，保留下面各层 |
| 关闭最上层弹窗 | 返回直接父路由，只关闭当前层 |
| 浏览器后退、前进 | 根据目标 URL 恢复对应的页面和弹窗层级 |
| 直接访问弹窗 URL | 渲染父页面及路径中的全部弹窗，无需先点击入口 |
| 刷新 | 按 URL 重新加载页面、业务数据和弹窗层级 |

路由决定业务弹窗是否存在，不另用一份页面级 `open` 状态控制同一个弹窗。表单输入、展开状态等仍由组件维护；刷新恢复不承诺恢复未提交的表单草稿。

关闭按钮、取消按钮、Esc 和允许的遮罩关闭应走同一条关闭逻辑。关闭目标来自路由父子关系，不能简单删除 URL 的最后一段：`detail/:orderId` 包含两个路径段，但只表示一层弹窗。

关闭不得只依赖 `navigate(-1)`。用户可能通过外部链接进入，历史记录中的上一页不一定是父页面。关闭时显式导航到直接父路由，并统一使用 `replace` 替换当前历史项。浏览器自身的后退、前进保持原有语义。替换可能留下相邻的重复父页面历史项，这是此策略的已知结果，不通过猜测浏览器历史来消除。

父页面的查询参数在打开、嵌套导航和关闭时原样保留，直接沿用当前 `location.search`，不重新解析拼装。弹窗默认不新增查询参数，记录标识使用路径参数，临时交互状态保存在组件内部。确需通过 URL 恢复弹窗状态时，再单独设计其查询参数约定，不预先增加参数命名空间或清理协议。

新增、保存成功后按业务要求刷新相关数据，再关闭当前层或进入明确指定的目标路由。数据刷新由业务组件负责，通用弹窗组件不绑定特定数据源。

## 默认弹窗组件

### Dialog 与 Drawer

两套模板均提供本地 `RouteDialog` 和 `RouteDrawer`，需要弹窗的插件提供一致的本地实现。Dialog 用于居中展示的业务内容，Drawer 用于侧边展开的业务内容；二者使用相同的路由规则，可以嵌套组合。

各处实现遵循以下默认行为和样式，外观使用已有主题 Token：

- 默认宽度、视口尺寸限制和窄屏表现。
- 标题区、关闭按钮、内容区和可选操作区。
- 内容区域滚动，长表单不把关闭按钮挤出可视区域。
- 遮罩、层级、背景滚动锁定和过渡效果。
- 可访问名称、键盘操作、焦点约束与关闭后的焦点恢复。
- 与应用主题一致的颜色、字体、间距、圆角和阴影。

嵌套时，仅最上层响应 Esc、遮罩点击和焦点交互。关闭子弹窗后，焦点回到父弹窗中的合理位置；直接访问时没有触发按钮，应提供合理的焦点回退。弹窗已挂载后的数据加载、记录不存在或业务加载失败，应保留可关闭的外壳。路由组件模块尚未加载或子路由权限被拒绝时，本地包装尚未挂载，如何提供可关闭的提示需另行设计，不能假设业务包装已经存在。父页面已经展示时，子层异常不能把父页面替换掉。

业务组件负责标题、内容、表单、数据加载和操作结果。默认业务弹窗采用独立的路由包装方式，Dialog 和 Drawer 包装组件分别暂定名为 `RouteDialog` 和 `RouteDrawer`。

`RouteDialog` 和 `RouteDrawer` 分别复用 Dialog 和 Drawer 的呈现与基础交互，并统一衔接路由：根据父子关系确定关闭目标，将关闭按钮、取消、Esc 和允许的遮罩关闭接入同一关闭逻辑。业务组件使用该包装组件承载内容，不逐个重复实现返回父路由的逻辑；打开入口仍通过导航进入子路由。

两种包装组件遵循相同的路由与关闭规则。AI 在父页面和有子弹窗的业务组件中显式放置 `Outlet`，路由层与包装组件均不自动插入出口。嵌套弹窗出口放在当前包装组件之外，作为同一业务路由组件返回的兄弟节点，避免子弹窗内容进入父弹窗的滚动容器。

### 组件 API 提案（待审核）

建议两种包装使用相同的最小属性集合，由本地文件分别导出，不把底层组件的全部属性直接透传为公共约定：

```ts
import type { ReactNode } from 'react';

export interface RouteOverlayProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly closeOnEscape?: boolean;
  readonly closeOnOutsideClick?: boolean;
}
```

这里的 `RouteOverlayProps` 是两种本地组件共用的属性类型提案，不新增运行时注册协议。

| 属性 | 提案 |
| --- | --- |
| `title` | 必填，绑定弹窗可访问标题 |
| `description` | 可选说明，提供时绑定可访问描述 |
| `children` | 可滚动的业务内容 |
| `footer` | 可选固定操作区，由业务提供取消、提交等按钮 |
| `className` | 应用于面板，允许定制宽度、尺寸和样式，合并规则沿用本地 `cn` |
| `closeOnEscape` | 默认 `true`，仅最上层响应 |
| `closeOnOutsideClick` | 建议默认 `false`，避免业务表单被遮罩点击意外关闭 |

建议 Dialog 默认居中，面板宽度使用 `w-full max-w-lg`；Drawer 默认从右侧打开，宽度使用 `w-full max-w-xl`。两者保留视口边距并限制高度，操作区和关闭按钮不随长内容滚出视口。默认尺寸和关闭选项同属待审核提案。

不提供 `open` 或任意 `onOpenChange` 来建立第二套打开状态。挂载即打开，退出路由即关闭。暂不新增尺寸枚举、任意关闭目标、全局弹窗服务或关闭拦截协议；有具体需求时单独讨论。

建议增加本地 `useRouteOverlayClose()`，供包装组件、业务取消按钮和提交成功后的逻辑调用。它返回无参 `close()`，内部在当前业务路由作用域使用 React Router 的相对父路由解析，导航到父路由并保留 `location.search`，统一 `replace: true`。不按字符串截断路径，也不使用 `navigate(-1)`。该 Hook 名称和调用形式仍待审核。

Hook 必须从当前弹窗对应的路由组件作用域调用；不能在另外注册的布局路由中复用后假定父级仍相同。实现时以包含多个路径段的子路由及嵌套测试验证相对路由语义。

底层 UI 优先遵循现有 shadcn / Base UI 约定，由模板或插件本地拥有。通用关闭文案放入各自翻译资源，不能在插件中导入模板私有翻译或组件。准确的底层组件选择和源码同步方式在实现前补齐。

### 自定义样式

用户未要求时，AI 直接复用默认组件，不为每个业务弹窗重新实现遮罩、关闭按钮和滚动容器。需要定制时优先在业务组件范围内调整，遵循模板的 [主题 Token 规范](../packages/templates/app-template-default/skills/nocobase-app-development/references/theme-tokens.md)。

自定义样式不改变 URL、父子关系、关闭目标和键盘交互。只有需求明确影响整个应用时，才修改共享默认样式。`RouteDialog` 和 `RouteDrawer` 名称暂定，其余导出名、属性、尺寸选项和样式定制入口在实现前单独确认，不在本文中预设一套新的配置协议。

## 当前实现与缺口

当前代码中：

- `client/routes.ts` 使用 `defineAppRoutes()` 声明普通页面路由。
- `packages/app/app-client/src/plugins.ts` 的 `AppClientRouteDefinition` 不包含子路由字段。
- `client/routing/app-router.tsx` 将普通路由逐条渲染为平级的 React Router `Route`。
- `client/routing/client-route.tsx` 负责组件加载、权限检查和页面错误状态。
- 设置路由已有的 `children` 表示导航分组，其子项是设置页面，并非可以递归嵌套的弹窗。

因此，只在 `client/routes.ts` 中填写更长的路径不能实现所需行为：URL 虽然可能匹配，父页面和父弹窗并不会因此自动保持渲染。需要同时设计声明、解析和渲染的父子关系。

## 插件弹窗路由

### 声明与所有权

插件拥有的页面，其业务弹窗在插件自己的 Client Route contribution 中声明为子路由。沿用 `defineAppRoutes()`、`defineSettingsRoutes()` 等已有入口，经 `client/plugin.ts` 的 `routes` contribution 进入目标应用。递归子路由 API 与应用侧一起设计，不给插件增加独立的弹窗 loader、Provider 注册或弹窗管理服务。

例如订单插件拥有 `/orders` 页面，则订单详情及其中的商品、客户详情都由该插件声明，完整路径仍为：

```text
/orders/detail/:orderId
/orders/detail/:orderId/item-detail/:itemId
/orders/detail/:orderId/customer-detail/:customerId
```

插件包名用于路由身份和所有权，不强行加入 URL。不同插件的最终路径冲突仍应被检测，不能因为来自不同包就允许重复路径。页面组件继续通过 `componentLoader()` 懒加载，沿用插件自己的翻译命名空间。

| 场景 | 声明位置与边界 |
| --- | --- |
| 插件页面打开插件业务弹窗 | 在所属插件的路由声明中增加子路由 |
| 应用页面组合插件公开的业务内容组件 | 由应用声明子路由和弹窗外壳，通过插件公开 export 使用内容组件 |
| 应用替换插件弹窗 UI | 沿用路由覆盖机制替换组件，不重复声明路由，不改变原路径和所有权 |
| 一个插件使用另一个插件的业务内容 | 仅使用对方公开入口，路由由当前父页面的拥有方声明 |
| 应用或其他插件向已有插件页面追加子路由 | 不支持；使用公开业务内容组件，在自己拥有的父路由下组合 |

不能为了追加弹窗而修改另一个插件的私有路由数组，也不能凭 URL 前缀自动把不同插件的路由拼成父子关系。本方案不支持跨所有者挂载，不新增对应扩展 API。

### 样式与组件边界

插件弹窗也需要稳定的默认样式，遵循前述 Dialog、Drawer 的布局、主题、嵌套和可访问性要求。自定义样式同样不能改变路由与导航规则。

`RouteDialog` 和 `RouteDrawer` 放在两套模板自己的 `client/components/` 中，插件按需在自己的相同目录提供本地实现。应用代码导入应用组件，插件代码导入插件组件，不从消费应用的 `@/components` 或模板源码导入。Registry 安装到应用的源码由应用拥有，使用应用的本地组件。

模板与插件中的路由包装、关闭 Hook、默认样式和交互实现保持一致；仅导入路径与翻译命名空间按所有者调整。不为每个插件另设计 props 或关闭规则。用户明确要求的业务样式通过约定入口定制，不改变标准实现。

现有[插件组件规范](development/plugin-development/client-components.md)中由插件拥有本地 UI primitives 的规则继续适用。本方案不新增 `@nocobase/app-client` 的 UI 导出或共享 UI 包。

开发指引提供统一的完整参考源码和一致性验证步骤，创建或修复标准实现时同步两套模板及已采用它的插件。参考源码的存放位置及检查方式仍需确定，不先引入新的代码同步生成器。

### 权限与验证

父路由必须通过认证和权限检查后才渲染页面及其 `Outlet`，因此父页面不可访问时，其弹窗也不渲染，直接访问深层 URL 同样如此。子路由如声明额外 `access`，需在父级允许的基础上继续检查，不能替代或放宽父级限制。子路由不自行改变父链的登录模式，具体类型约束待确认。Client 权限检查不替代 Server API 的独立认证和授权。子弹窗的记录参数还需经过相应业务校验，不能只因父记录可访问就假定子记录也可访问。

插件测试验证子路由声明、参数、组件 loader 和所有权；目标应用验证真实打开、关闭、直达、刷新、嵌套和路由覆盖。Inspector 只辅助检查声明解析结果，不代替浏览器行为验证。

## 子路由声明与解析

确定扩展现有路由声明，使用递归 `children` 声明页面子路由，解析后仍保留树结构。模板递归渲染 `Route`，业务组件手动提供 `Outlet`。核心只处理通用父子关系，不依赖业务插件或本地弹窗组件。

子路径按示例使用相对路径，不重复父路径。路由名称唯一范围和 ID 生成规则尚需确认；解析树保留每个节点的归属、权限和 loader，现有路由覆盖、冲突检查及 Inspector 改为遍历树，不能只检查顶层节点。

`defineSettingsRoutes()` 同样支持页面子路由。弹窗子路由不配置 `navigation`，不进入设置导航；设置页面或现有导航分组仍按原有方式配置。设置导航分组与页面子路由是不同概念，不能继续仅以存在 `children` 判断是否为导航分组。具体类型和判定方式需审核后实现。

开发工具页面按相同页面子路由方向设计，并保持整棵开发路由子树在生产环境移除；其与设置路由共用类型的具体调整仍需确认。

拟议声明采用父路由下的相对路径，下面仅表达目标结构，当前 API 尚不支持：

```ts
defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
    children: [
      {
        name: 'orderCreate',
        path: 'create',
        componentLoader: () => import('./pages/orders/dialogs/create.js'),
      },
      {
        name: 'orderDetail',
        path: 'detail/:orderId',
        componentLoader: () => import('./pages/orders/dialogs/detail.js'),
        children: [
          {
            name: 'orderItemDetail',
            path: 'item-detail/:itemId',
            componentLoader: () => import('./pages/orders/dialogs/item-detail.js'),
          },
          {
            name: 'orderCustomerDetail',
            path: 'customer-detail/:customerId',
            componentLoader: () => import('./pages/orders/dialogs/customer-detail.js'),
          },
        ],
      },
    ],
  },
]);
```

已确认递归 `children`、解析树结构、手动 `Outlet`、统一 `replace`、查询参数原样保留和本地包装组件。仍需审核的具体契约为：

1. 路由名称唯一范围、ID 生成规则及现有路由覆盖如何定位树节点。
2. 本文组件属性和 `useRouteOverlayClose()` 提案，以及默认尺寸、遮罩关闭策略。
3. 子路由认证字段的类型约束、设置分组与页面节点的判定方式。
4. 路由模块加载失败或子级权限被拒绝、包装组件尚未挂载时的可关闭提示方案。
5. 本地标准实现的参考源码位置、一致性检查方式和底层 UI 依赖。

扩展现有 API 时必须检查普通页面、现有设置分组、路由覆盖、权限检查和发布声明的影响。不因本功能增加历史数据迁移；是否涉及已发布路由协议的兼容，实施前根据发布状态判断。

## 手动 Outlet 完整示例（基于待审核组件 API）

下面给出最小完整的页面 → 详情 Dialog → 商品 Drawer 链路。路由结构和手动出口方式已确认；`RouteDialog`、`RouteDrawer` 的属性及关闭 Hook 仍是提案，因此示例用于审核，当前不能直接运行。示例只展示路由，不虚构数据 API；实际业务按路径 ID 加载记录，文案接入所属应用或插件的翻译资源。

```ts
// client/routes.ts
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
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
          componentLoader: () => import('./pages/orders/dialogs/detail.js'),
          children: [
            {
              name: 'orderItemDetail',
              path: 'item-detail/:itemId',
              componentLoader: () => import('./pages/orders/dialogs/item-detail.js'),
            },
          ],
        },
      ],
    },
  ]),
];

export default routes;
```

```tsx
// client/pages/orders.tsx
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

export default function OrdersPage(): ReactElement {
  const { search } = useLocation();
  return (
    <>
      <section className='p-6'>
        <h1>Orders</h1>
        <Link to={{ pathname: 'detail/42', search }}>Order 42</Link>
      </section>
      <Outlet />
    </>
  );
}
```

```tsx
// client/pages/orders/dialogs/detail.tsx
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { RouteDialog } from '../../../components/route-dialog.js';
import { useRouteOverlayClose } from '../../../components/use-route-overlay-close.js';

export default function OrderDetail(): ReactElement {
  const { orderId } = useParams();
  const { search } = useLocation();
  const close = useRouteOverlayClose();
  return (
    <>
      <RouteDialog
        title={`Order ${orderId}`}
        footer={<button type='button' onClick={close}>Close</button>}
      >
        <Link to={{ pathname: 'item-detail/7', search }}>Item 7</Link>
      </RouteDialog>
      <Outlet />
    </>
  );
}
```

```tsx
// client/pages/orders/dialogs/item-detail.tsx
import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { RouteDrawer } from '../../../components/route-drawer.js';
import { useRouteOverlayClose } from '../../../components/use-route-overlay-close.js';

export default function ItemDetail(): ReactElement {
  const { orderId, itemId } = useParams();
  const close = useRouteOverlayClose();
  return (
    <RouteDrawer
      title={`Item ${itemId}`}
      footer={<button type='button' onClick={close}>Close</button>}
    >
      <p>Item {itemId} in order {orderId}</p>
    </RouteDrawer>
  );
}
```

入口使用相对路径并显式携带 `search`。详情中的 `Outlet` 位于 `RouteDialog` 外部；叶子商品详情没有子路由，无需放置出口。商品详情关闭到订单详情，订单详情关闭到订单页面，均保留原查询字符串。新增弹窗同样实现，只省略 ID 路径段及参数读取。

插件沿用同一业务组件结构，导入插件自己的本地包装文件；路由数组经现有插件 `routes` contribution 注册，不复制到应用 `client/routes.ts`。最终 Skills 还需提供无 ID 新增、设置页及插件聚合文件的完整可运行示例，并验证对应 API 已实现。

## 文件范围

### 标准能力实现阶段

以下模板相对路径同时适用于 `packages/templates/app-template-default/` 和 `packages/templates/app-template-hub/`。新增文件的名称是建议值，待 API 确认后固定。

| 文件或目录 | 职责 |
| --- | --- |
| `client/routes.ts` | 展示并使用子路由声明 |
| `client/routing/app-router.tsx` | 渲染父子路由，保留父页面 |
| `client/routing/client-route.tsx` | 检查嵌套场景中的权限、加载和错误边界 |
| `client/layouts/surface-layout.tsx`、`settings-layout.tsx`、`dev-layout.tsx` | 按审核后的范围接入设置页和开发工具页的嵌套渲染 |
| `client/components/route-dialog.tsx`、`route-drawer.tsx`（拟新增） | 本地标准路由包装组件 |
| `client/components/use-route-overlay-close.ts`（拟新增、API 待审核） | 统一返回父路由、保留查询参数和 replace |
| `client/components/ui/`、`client/styles.css`（按需） | 本地底层 UI、主题和样式接入 |
| `client/locales/` | 应用业务及本地包装组件的通用文案 |
| `tests/components/`、`tests/logic/` | 默认组件、路由和导航回归验证 |
| `skills/nocobase-app-development/SKILL.md` | 增加弹窗任务入口 |
| `skills/nocobase-app-development/references/client-pages-and-routes.md` | 说明子路由并链接弹窗规范 |
| `skills/nocobase-app-development/references/client-dialog-routes.md`（拟新增） | 完整操作规范、示例、文件清单和验证步骤 |
| `AGENTS.md`、`CLAUDE.md`、`client/AGENTS.md` | 在现有入口中指向规范，避免复制多份正文 |

核心只扩展通用子路由能力，候选范围为：

| 文件或目录 | 拟议变化 |
| --- | --- |
| `packages/app/app-client/src/plugins.ts` | 路由类型、声明规范化、子路由解析和校验 |
| `packages/app/app-client/src/runtime/index.ts` | 路由声明与解析结果的运行时衔接 |
| `packages/app/app-client/tests/plugins.test.tsx`、`tests/runtime.test.ts` | 子路由解析和现有协议回归 |

其他消费方根据最终解析结果结构定位，不预先扩大修改范围。核心和 API 的具体变更必须在审核后实施，不能把本文视为授权。

### AI 实现一个业务弹窗

标准能力落地后，日常业务开发的默认范围应收敛为：

| 文件 | 必须做什么 |
| --- | --- |
| `client/routes.ts` | 找到直接父路由，追加弹窗子路由 |
| 父页面或父弹窗组件 | 增加导航入口，手动放置 `Outlet` |
| `client/pages/<feature>/dialogs/<dialog>.tsx` | 实现业务内容，复用 `RouteDialog` 或 `RouteDrawer`，默认导出路由组件 |
| `client/locales/` | 添加业务标题和操作文案 |
| `tests/` 下对应业务测试 | 验证路径、打开、关闭及业务结果 |

已有项目采用其他业务目录时沿用现有组织，不为增加弹窗搬动整个页面目录。普通弹窗不需要新增侧边栏资源，也不需要改 `client/service-provider.ts`；只有业务明确需要导航入口时才按已有页面规范处理。

默认不修改核心路由、共享弹窗实现、应用 Shell、布局、插件注册或依赖清单。确有能力缺口时先说明原因，不在业务页面复制一套通用弹窗管理机制。

### AI 实现一个插件业务弹窗

以下路径相对于所属 `packages/plugins/app-plugin-<name>/`。路由聚合文件沿用插件现有组织；通常为 `client/routes/index.ts`，已有其他组织时不为增加弹窗搬动文件。

| 文件 | 操作范围 |
| --- | --- |
| `client/routes/` 中所属路由声明 | 在插件拥有的直接父路由下添加子路由 |
| 父页面或父弹窗组件 | 添加导航入口，手动放置 `Outlet` |
| `client/pages/` 中对应业务弹窗组件 | 实现业务内容，复用插件本地 `RouteDialog` 或 `RouteDrawer` |
| `client/locales/` | 添加插件命名空间中的标题和操作文案 |
| `tests/` | 验证路由声明、loader 和业务行为 |
| `skills/`（按需） | 公开集成方式改变时更新 App-facing 指引；不为纯内部弹窗强制新增 Skill |
| 目标应用的 `tests/` | 验证插件在应用中的真实导航与呈现 |

已有 `routes` contribution 时不需修改 `client/plugin.ts` 或应用的 `client/routes.ts`。插件已注册时不需重新修改应用的 `client/plugins.ts`。仅首次提供 Client routes 或首次接入插件时，按现有声明和注册流程补齐对应入口。

插件首次需要路由包装时，在自己的 `client/components/` 按标准参考实现添加两个包装组件及关闭 Hook；已有实现则直接复用，不能在每个业务弹窗中重写。

默认不改核心、其他插件私有文件和应用共享布局。新公开 export、组件 props 或跨插件调用方式均属于 API 设计，不能作为普通业务弹窗的附带修改直接实施。

## 开发 Skills 的写法

应用侧操作规范放在两套模板自带的 `references/client-dialog-routes.md`，随生成应用交付。`SKILL.md` 的任务索引加入“新增或修改业务弹窗”，已有页面路由文档和 Agent 入口链接到同一正文，使不同 AI 通过现有开发入口发现规则。

规范应按固定步骤写明：

1. 判断是短暂提示还是业务弹窗。
2. 找到直接父路由，确定弹窗名称和是否需要业务 ID。
3. 在 `client/routes.ts` 中添加子路由，保留组件懒加载。
4. 使用 `RouteDialog` 或 `RouteDrawer` 实现内容，并按标准放置子路由出口。
5. 使用路由导航打开，使用统一关闭入口返回父路由。
6. 添加翻译和针对性测试，验证直达、刷新、关闭及嵌套。

每个示例必须给出完整文件路径、可用导入、完整组件和对应路由声明。至少覆盖无 ID 的新增、带 ID 的详情或编辑，以及订单详情中的商品详情、客户详情。明确 URL 命名和源码文件命名分别遵循各自约定，URL 静态名称段使用 kebab-case；动态参数名和 TypeScript 标识符仍沿用 lowerCamelCase，例如 `:orderId`、`:itemId`，不改为连字符形式。源码文件名沿用项目约定。

只有在 API 已实现并通过验证后，才将拟议代码写成 Skills 中的可执行指令。两套模板提供相同框架规范，各自保留产品内容和身份。

### 插件开发指引

插件源码开发与 App 使用插件是两个不同入口，分别维护：

| 入口或文件 | 需要补充的内容 |
| --- | --- |
| 仓库 `nocobase-plugin-development` Skill | 将业务弹窗任务引导到插件路由规范 |
| `internal-docs/development/plugin-development/README.md`、`routes.md` | 增加弹窗开发任务入口 |
| `internal-docs/development/plugin-development/client-dialog-routes.md`（拟新增） | 插件开发操作步骤、所有权、默认组件导入、具体文件清单与验证 |
| `internal-docs/development/plugin-development/client-routes-examples.md`、`client-components.md` | 链接弹窗规范，保持路由声明和组件复用约定一致 |
| 插件拥有的 `skills/` | 仅描述该插件实际公开的弹窗入口、参数、内容组件及应用集成方法 |

插件开发规范提供与应用侧等价的新增、详情和嵌套示例，但使用插件自己的贡献声明、组件和命名空间。两侧共享路径与行为规则，文件清单按所有权分别编写。

Plugin Skills 面向消费插件的 App Agent，不承担插件私有源码开发说明。源文件保存在插件顶层 `skills/`，同步到应用的 `.agents/skills/` 是生成副本，不能在那里维护规范。不得将本设计稿中的拟议接口提前作为已发布插件能力写入 Skill。

## 验证与验收

行为实现遵循风险驱动 TDD：先补针对性测试并确认按预期失败，再实现并运行同一测试确认通过，随后验证相关消费方。

| 验证项 | 预期结果 |
| --- | --- |
| 新增弹窗 | 无 ID 路径可打开和关闭 |
| 详情与编辑 | 参数正确，直达和刷新后独立加载数据 |
| 嵌套弹窗 | 商品和客户参数互不覆盖，父层保持挂载 |
| 关闭 | 所有允许的关闭入口只关闭最上层，回到直接父路由 |
| 外部链接直达 | 关闭不会依赖站外历史或错误返回其他页面 |
| 浏览器导航 | 后退和前进与目标 URL 对应，不出现 URL 和弹窗状态分离 |
| URL 状态 | 保留父页面筛选与分页，原样保留父页面查询字符串，弹窗默认不新增查询参数 |
| 异常与权限 | 子层失败可关闭，父层保留，子级无法绕过父级检查 |
| 样式和可访问性 | Dialog、Drawer 及混合嵌套在窄屏、主题切换和键盘操作下正常 |
| 部署前缀 | 根路径和非根部署前缀均可直达及刷新 |
| 回归 | 普通页面、设置分组、开发路由边界和路由覆盖行为正常 |
| AI 开发路径 | 仅按 Skill 所列业务文件即可完成示例，不需要临时修改基础设施 |
| 插件一致性 | 插件页面遵循相同路径和导航规则，App 与插件路由冲突可检测 |
| 插件组件边界 | 模板和插件本地实现一致，插件不依赖模板私有路径；默认样式及混合嵌套在目标应用中正常 |
| 插件覆盖与集成 | 覆盖弹窗组件保留路由身份和父子关系，公开内容组件可在应用自有路由中组合 |

实现阶段对两套模板分别运行 `pnpm --filter <模板包名> check`。修改核心时，对 `@nocobase/app-client` 及受影响消费方运行 `lint`、`typecheck`、`test` 和 `build`；通过浏览器验证焦点、遮罩、滚动和嵌套交互。涉及发布产物时按仓库规则补充 changeset。

本设计文档本身只需检查路径引用、内容一致性和差异，不运行应用测试或构建。
