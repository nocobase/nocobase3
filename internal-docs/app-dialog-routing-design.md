---
title: App 弹窗路由规范
description: 应用与插件业务弹窗的子路由、嵌套导航、默认组件与 AI 开发文件范围
---

# App 弹窗路由规范

## 文档状态

本文是规范设计稿。业务弹窗使用子路由、ID 可选、嵌套路径命名、关闭返回父路由，以及模板提供 Dialog 和 Drawer 的方向已确认。默认业务弹窗确定采用独立的路由包装方式，Dialog 和 Drawer 包装组件分别暂定名为 `RouteDialog` 和 `RouteDrawer`。具体路由声明 API、组件属性和注册结果结构仍需审核，本文中的拟议接口不代表当前已经可用。

本阶段只编写设计文档，不修改核心、模板或开发 Skills。后续实现同时覆盖 `app-template-default` 和 `app-template-hub`。

## 目标与范围

AI 在页面中实现业务弹窗时，统一在当前页面路由下声明弹窗子路由。URL 表达当前打开的页面和弹窗层级，使链接直达、刷新恢复、浏览器前进后退具有一致行为。

模板提供 Dialog 和 Drawer 两种默认弹窗，统一样式和基础交互。AI 默认复用，用户要求定制时可以调整样式，但仍遵循同一套路由和关闭规则。

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

关闭不得只依赖 `navigate(-1)`。用户可能通过外部链接进入，历史记录中的上一页不一定是父页面。建议关闭时显式导航到直接父路由，并替换当前历史项，避免下一次后退立即重新打开刚关闭的弹窗。这个历史写入策略属于待审核的实现约定；浏览器自身的后退、前进保持原有语义。

父页面的筛选、分页等 URL 状态应在打开和关闭弹窗时保留，弹窗独有的查询参数不应泄漏到父页面。实现前明确这些参数的归属，不以历史记录中的临时对象作为直达和刷新的必要条件。

新增、保存成功后按业务要求刷新相关数据，再关闭当前层或进入明确指定的目标路由。数据刷新由业务组件负责，通用弹窗组件不绑定特定数据源。

## 默认弹窗组件

### Dialog 与 Drawer

两套模板均提供默认 Dialog 和 Drawer。Dialog 用于居中展示的业务内容，Drawer 用于侧边展开的业务内容；二者使用相同的路由规则，可以嵌套组合。

模板统一维护：

- 默认宽度、视口尺寸限制和窄屏表现。
- 标题区、关闭按钮、内容区和可选操作区。
- 内容区域滚动，长表单不把关闭按钮挤出可视区域。
- 遮罩、层级、背景滚动锁定和过渡效果。
- 可访问名称、键盘操作、焦点约束与关闭后的焦点恢复。
- 与应用主题一致的颜色、字体、间距、圆角和阴影。

嵌套时，仅最上层响应 Esc、遮罩点击和焦点交互。关闭子弹窗后，焦点回到父弹窗中的合理位置；直接访问时没有触发按钮，应提供合理的焦点回退。加载、无权限、记录不存在或加载失败时，也应保留可关闭的弹窗外壳，不用整页错误替换已经展示的父页面。

业务组件负责标题、内容、表单、数据加载和操作结果。默认业务弹窗采用独立的路由包装方式，Dialog 和 Drawer 包装组件分别暂定名为 `RouteDialog` 和 `RouteDrawer`。

`RouteDialog` 和 `RouteDrawer` 分别复用 Dialog 和 Drawer 的呈现与基础交互，并统一衔接路由：根据父子关系确定关闭目标，将关闭按钮、取消、Esc 和允许的遮罩关闭接入同一关闭逻辑。业务组件使用该包装组件承载内容，不逐个重复实现返回父路由的逻辑；打开入口仍通过导航进入子路由。

两种包装组件遵循相同的路由与关闭规则。包装组件的具体属性、业务取消与提交成功后的关闭调用方式、子路由出口位置，以及加载和错误外壳的组合方式仍需审核。选择路由包装不代表新增公开 Hook、Context 或注入协议，也不决定插件如何获取该组件。

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
| 应用或其他插件向已有插件页面追加子路由 | 属于跨所有者扩展；现有组件覆盖不等于追加路由能力，须另行确认公开扩展方式 |

不能为了追加弹窗而修改另一个插件的私有路由数组，也不能凭 URL 前缀自动把不同插件的路由拼成父子关系。跨所有者挂载如需支持，应单独比较方案并审核 API，不作为当前同一所有者子路由方案的隐含能力。

### 样式与组件边界

插件弹窗也需要稳定的默认样式，遵循前述 Dialog、Drawer 的布局、主题、嵌套和可访问性要求。自定义样式同样不能改变路由与导航规则。

模板中的组件是应用源码，发布插件不能从模板源码或消费应用的 `@/components` 导入。现有[插件组件规范](development/plugin-development/client-components.md)要求插件拥有本地 UI primitives；Registry 源码安装到应用后则由应用拥有，可使用应用组件。这两种场景必须区分。

默认外壳的交付方式需要与组件 API 一起审核：

| 方案 | 优点 | 代价与边界 |
| --- | --- | --- |
| 插件维护符合标准的本地 Dialog、Drawer | 符合现有源码所有权，不依赖消费应用的私有文件 | 与模板需要同步样式和交互规范，代码实现可能漂移 |
| 通过公开共享包提供组件 | 应用与插件复用同一实现 | 新增包或公开导出契约，需评估依赖、版本和应用定制方式 |
| 应用提供外壳，插件路由只提供内容 | 应用可统一全局弹窗外观 | 需要新的呈现或注入契约，涉及路由和组件 API，维护成本更高 |

本文先统一行为和样式要求，不把某个复用方案视为已批准。最终开发 Skills 必须明确唯一的默认实现路径和可用导入，不能让 AI 每次自行选择，也不能引用不存在的共享 UI 导出。

### 权限与验证

插件弹窗不得绕过父页面的认证、权限或目标应用的访问边界。Client 权限检查不替代 Server API 的独立认证和授权。子弹窗的记录参数还需经过相应业务校验，不能只因父记录可访问就假定子记录也可访问。

插件测试验证子路由声明、参数、组件 loader 和所有权；目标应用验证真实打开、关闭、直达、刷新、嵌套和路由覆盖。Inspector 只辅助检查声明解析结果，不代替浏览器行为验证。

## 路由 API 方案比较

以下是供审核的方案，不是已批准的核心修改。

| 方案 | 实现方式 | 影响与维护成本 |
| --- | --- | --- |
| 扩展现有路由声明 | 为页面路由提供递归子路由，模板递归渲染 | 一处声明完整结构，AI 操作最直接；涉及核心类型、解析、路由标识和消费方，需要完整测试 |
| 模板维护独立子路由声明 | 保持核心平铺协议，在模板中补充嵌套关系 | 核心修改较少，但形成两套路由结构，权限、覆盖和工具展示容易不一致 |
| 页面内自行声明路由 | 各页面内部使用 React Router 管理弹窗 | 初期改动小，但声明分散，无法通过 `client/routes.ts` 统一查看，后续 AI 仍需逐页判断 |

建议优先评审第一种方案。核心只支持通用父子路由，Dialog 和 Drawer 的呈现留在模板，不向核心添加业务弹窗类型或插件依赖。

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

实现前需要确认以下契约：

1. 子路由声明字段、相对路径规则、名称唯一性和路由 ID 生成方式。
2. 解析结果保留树还是提供可重建父子关系的结构，以及 Inspector、路由覆盖和冲突检查如何消费。
3. 子路由的认证与权限规则。建议保留整条父链的检查，子级不能绕过父级限制；声明和继承方式需确定。
4. 子路由出口由页面放置还是由模板路由层提供。需保证父内容持续挂载、子层独立加载，并在 Skills 中只提供一种标准写法。
5. 设置页面和开发工具页面如何支持业务弹窗，同时保持原导航分组语义和开发路由的生产构建边界。
6. 采用路由包装，名称暂定为 `RouteDialog` 和 `RouteDrawer`；仍需确认组件属性、关闭入口、历史写入策略及查询参数保留规则。
7. 插件默认弹窗外壳的交付方式，以及应用与插件共用路由协议时的所有权和覆盖行为。跨所有者追加子路由不隐式包含在本次扩展中。

扩展现有 API 时必须检查普通页面、现有设置分组、路由覆盖、权限检查和发布声明的影响。不因本功能增加历史数据迁移；是否涉及已发布路由协议的兼容，实施前根据发布状态判断。

## 文件范围

### 标准能力实现阶段

以下模板相对路径同时适用于 `packages/templates/app-template-default/` 和 `packages/templates/app-template-hub/`。新增文件的名称是建议值，待 API 确认后固定。

| 文件或目录 | 职责 |
| --- | --- |
| `client/routes.ts` | 展示并使用子路由声明 |
| `client/routing/app-router.tsx` | 渲染父子路由，保留父页面 |
| `client/routing/client-route.tsx` | 检查嵌套场景中的权限、加载和错误边界 |
| `client/layouts/surface-layout.tsx`、`settings-layout.tsx`、`dev-layout.tsx` | 按审核后的范围接入设置页和开发工具页的嵌套渲染 |
| `client/components/route-dialog.tsx`、`client/components/route-drawer.tsx`（拟新增） | 路由包装组件，复用底层 UI 并统一关闭导航 |
| `client/components/ui/` | 按需补充底层 UI 原语 |
| `client/locales/` | 通用弹窗文案 |
| `tests/components/`、`tests/logic/` | 默认组件、路由和导航回归验证 |
| `skills/nocobase-app-development/SKILL.md` | 增加弹窗任务入口 |
| `skills/nocobase-app-development/references/client-pages-and-routes.md` | 说明子路由并链接弹窗规范 |
| `skills/nocobase-app-development/references/client-dialog-routes.md`（拟新增） | 完整操作规范、示例、文件清单和验证步骤 |
| `AGENTS.md`、`CLAUDE.md`、`client/AGENTS.md` | 在现有入口中指向规范，避免复制多份正文 |

如采用扩展现有路由声明的方案，核心候选范围为：

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
| 父页面或父弹窗组件 | 增加导航入口，按标准提供子路由出口（如最终方案要求） |
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
| 父页面或父弹窗组件 | 添加导航入口，按最终标准处理子路由出口 |
| `client/pages/` 中对应业务弹窗组件 | 实现业务内容，使用审核后的默认外壳方案 |
| `client/locales/` | 添加插件命名空间中的标题和操作文案 |
| `tests/` | 验证路由声明、loader 和业务行为 |
| `skills/`（按需） | 公开集成方式改变时更新 App-facing 指引；不为纯内部弹窗强制新增 Skill |
| 目标应用的 `tests/` | 验证插件在应用中的真实导航与呈现 |

已有 `routes` contribution 时不需修改 `client/plugin.ts` 或应用的 `client/routes.ts`。插件已注册时不需重新修改应用的 `client/plugins.ts`。仅首次提供 Client routes 或首次接入插件时，按现有声明和注册流程补齐对应入口。

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
| URL 状态 | 保留父页面筛选与分页，不向父级泄漏弹窗专属参数 |
| 异常与权限 | 子层失败可关闭，父层保留，子级无法绕过父级检查 |
| 样式和可访问性 | Dialog、Drawer 及混合嵌套在窄屏、主题切换和键盘操作下正常 |
| 部署前缀 | 根路径和非根部署前缀均可直达及刷新 |
| 回归 | 普通页面、设置分组、开发路由边界和路由覆盖行为正常 |
| AI 开发路径 | 仅按 Skill 所列业务文件即可完成示例，不需要临时修改基础设施 |
| 插件一致性 | 插件页面遵循相同路径和导航规则，App 与插件路由冲突可检测 |
| 插件组件边界 | 不依赖模板私有路径，默认样式及混合嵌套在目标应用中正常 |
| 插件覆盖与集成 | 覆盖弹窗组件保留路由身份和父子关系，公开内容组件可在应用自有路由中组合 |

实现阶段对两套模板分别运行 `pnpm --filter <模板包名> check`。修改核心时，对 `@nocobase/app-client` 及受影响消费方运行 `lint`、`typecheck`、`test` 和 `build`；通过浏览器验证焦点、遮罩、滚动和嵌套交互。涉及发布产物时按仓库规则补充 changeset。

本设计文档本身只需检查路径引用、内容一致性和差异，不运行应用测试或构建。
