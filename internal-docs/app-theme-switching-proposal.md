---
title: NocoBase 3 的主题切换
description: App 模板的主题预设、外观切换、按应用隔离的偏好存储与 AI 主题维护约定
---

# NocoBase 3 的主题切换

## 文档状态

主题切换已在 Default 和 Hub 两套 App 模板中实现，本文记录已确认的产品行为、实现归属和主题维护约定。最初 HTML Loading 与用户所选主题的配色一致性暂缓处理，详见「首屏恢复（暂缓）」。

## 目标与范围

在页面右上角提供外观设置入口，允许用户选择主题，并独立设置浅色、深色或跟随系统。用户的选择即时生效，刷新页面后保留。

主题由 App 自己的源码定义和维护。用户可以直接对 AI 说“添加一个海洋主题”或“把海洋主题的主色调得柔和一些”，AI 按 Skill 指引编辑 CSS 和主题清单。新增主题后，主题选择面板自动展示对应选项。

第一版包含：

- 多个源码定义的主题预设，每个预设支持浅色和深色。
- 页面右上角的主题选择和亮暗模式选择。
- 浏览器本地偏好保存、启动恢复和无效值回退。
- 指引 AI 新增、修改、删除主题的开发文档。

第一版随模板提供“默认”和“海洋”两个预设，用于验证多主题流程。默认预设保留当前模板的配色；海洋主题的最终颜色需经过亮暗模式的视觉验收。后续主题按相同方式添加。

第一版不包含账号同步、在线颜色编辑器、主题市场或插件注册主题。这些能力需要时另行设计。

## 实现归属

功能整体实现在 App 模板中。主题 CSS、主题清单、状态、持久化和选择面板都由 App 拥有。

当前全局样式位于 `client/styles.css`，根级主题 Provider 位于 `client/theme/`，右上角入口由 App Shell 直接组合。将主题功能集中维护，能让 AI 在同一份应用源码中完成主题开发，也便于应用自主定制。

继续使用 `next-themes` 管理浅色、深色和跟随系统。多主题预设在 App 内增加状态管理，不需要新增内核能力或插件扩展点。

开发仓库中的 Default 和 Hub 两套模板同步实现。应用生成后，其主题属于该应用；AI 为某个已生成应用添加主题时，只修改该应用，无需访问或同步另一套模板。

## 用户如何使用

### 右上角入口

将现有主题切换按钮升级为“外观设置”按钮。按钮使用调色盘图标，沿用当前 Header 的尺寸和视觉风格，点击后打开 Popover。

应用首页、设置页和开发工具页使用同一个组件；登录等独立页面沿用已有的右上角挂载位置，渲染相同组件。

### 面板结构

以下为结构示意，最终视觉以现有 App 组件样式为准：

```text
┌─────────────────────────────────┐
│ 外观                            │
│                                 │
│ 显示模式                        │
│ [ 跟随系统 ] [ 浅色 ] [ 深色 ]  │
│                                 │
│ 主题                            │
│ ┌─────────────┐ ┌─────────────┐ │
│ │ 颜色预览    │ │ 颜色预览    │ │
│ │ 默认      ✓ │ │ 海洋        │ │
│ └─────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

- 显示模式采用三段式单选控件；跟随系统是一个独立选项。
- 主题采用两列卡片，展示名称和小型颜色预览。
- 当前选项通过边框、勾选和单选语义共同表示，不只依靠颜色。
- 点击后立即应用并保存，无需“保存”按钮；面板保持打开，方便比较。
- 切换主题不改变显示模式，切换显示模式不改变主题。
- 预览跟随当前实际亮暗模式；选择“跟随系统”时，由系统状态决定预览亮暗。
- 窄屏下限制面板宽度；主题较多时允许主题区域滚动，不撑出视口。
- 支持键盘导航、Esc 关闭及关闭后的焦点恢复。文案和主题名称支持应用国际化。

优先复用现有 shadcn 组件。第一版无需增加全页面颜色过渡动画；首屏恢复时也不播放切换动画。

## 主题定义与代码组织

### 两个独立维度

| 维度 | 可选值示例 | 作用 |
| --- | --- | --- |
| 显示模式 | `system`、`light`、`dark` | 决定使用浅色还是深色变量 |
| 主题预设 | `default`、`ocean` | 决定使用哪一组主题配色 |

实际 DOM 使用：

```html
<html class="dark" data-theme="ocean">
```

`next-themes` 管理 `light` / `dark` class。App 的主题预设状态管理 `data-theme`。选择 `system` 时，保存的偏好仍为 `system`，DOM 使用解析后的 `light` 或 `dark`。

### 文件组织

```text
client/
├── styles.css                     全局样式入口、Tailwind 映射和公共基础样式
├── theme/
│   ├── theme-presets.ts            静态主题清单、默认主题和预设 ID 类型
│   ├── theme-provider.tsx          组合亮暗模式和预设状态
│   ├── theme-settings.tsx          外观设置按钮和面板
│   ├── index.ts                   App 内使用的主题入口
│   └── themes/
│       ├── default.css            默认主题的浅色与深色 Token
│       └── ocean.css              海洋主题的浅色与深色 Token
├── locales/                       外观设置和主题名称的翻译
└── shell/header-actions.tsx        组合右上角入口
```

`client/styles.css` 统一引入主题 CSS。原有默认配色移入 `default.css`，避免同一套颜色在两处维护。所有内置主题 CSS 随应用加载，不在点击主题时临时请求。

### 静态主题清单

清单决定面板中有哪些主题及展示顺序，采用以下结构：

```ts
export const themePresets = [
  { id: 'default', labelKey: 'appearance.themes.default' },
  { id: 'ocean', labelKey: 'appearance.themes.ocean' },
] as const;

export type ThemePresetId = (typeof themePresets)[number]['id'];

export const defaultThemePreset: ThemePresetId = 'default';
```

约定：

- ID 使用唯一的小写 kebab-case，并与 CSS 的 `data-theme` 值一致。
- 清单中的顺序就是面板顺序；每项必须有对应 CSS 和名称翻译。
- 修改显示名称只修改翻译，通常不修改 ID。
- 清单只保存元数据，颜色值保存在 CSS 中。
- UI 直接遍历清单，新增主题不需要修改面板组件。
- 清单保持为无 DOM、无存储读写的静态模块，方便启动初始化、类型和测试共同使用。

不通过运行时扫描 CSS 自动发现主题，也不为此增加插件注册机制。

### CSS 选择器

主题通过 CSS Variables 实现。下面仅展示部分 Token，用于说明选择器；实际主题应提供约定的完整配色 Token。

```css
/* 默认主题：浅色；也是没有 data-theme 时的基础样式 */
:root {
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.16 0 0);
  --primary: oklch(0.18 0 0);
  --primary-foreground: oklch(0.985 0 0);
}

/* 默认主题：深色 */
:root.dark {
  --background: oklch(0.13 0 0);
  --foreground: oklch(0.96 0 0);
  --primary: oklch(0.94 0 0);
  --primary-foreground: oklch(0.16 0 0);
}

/* 海洋主题：浅色，示例颜色 */
:root[data-theme='ocean'] {
  --background: oklch(0.985 0.008 245);
  --foreground: oklch(0.2 0.03 245);
  --primary: oklch(0.5 0.14 245);
  --primary-foreground: oklch(0.985 0 0);
}

/* 海洋主题：深色，示例颜色 */
:root.dark[data-theme='ocean'] {
  --background: oklch(0.16 0.02 245);
  --foreground: oklch(0.96 0.01 245);
  --primary: oklch(0.75 0.12 245);
  --primary-foreground: oklch(0.18 0.03 245);
}
```

默认主题先引入，其他主题后引入。`:root` 和 `:root.dark` 会同时匹配其他主题，因此新增主题必须明确覆盖自己的配色，不能遗漏深色定义。

当前模板需要覆盖的配色 Token 为：

```text
background / foreground
card / card-foreground
popover / popover-foreground
primary / primary-foreground
secondary / secondary-foreground
muted / muted-foreground
accent / accent-foreground
destructive
border / input / ring
```

上表中的名称均对应带 `--` 前缀的 CSS 变量。背景与文字成对设计，同时检查悬停、选中、禁用和焦点状态。已有语义保持一致，例如 `destructive` 仍表达危险操作。

`--radius` 等公共结构变量可以在全局统一定义；需要改变圆角等视觉特征的主题，在自己的 CSS 中显式覆盖。以后增加共享 Token 时，同步更新主题规范及现有主题。

业务组件继续使用 `bg-background`、`text-foreground`、`bg-primary` 等语义类。使用这些 Token 的插件组件会随 App 变化；硬编码颜色、独立文档或 iframe 内的内容不会自动适配，应分别检查。

### 卡片预览复用主题 CSS

预览无需复制一套颜色到 TypeScript。可在主题 CSS 的同一规则中，增加仅用于预览容器的选择器，让它取得相同变量：

```css
:root[data-theme='ocean'],
.theme-preview[data-theme='ocean'] {
  /* 此主题完整的浅色配色 Token，只写一份 */
}

:root.dark[data-theme='ocean'],
:root.dark .theme-preview[data-theme='ocean'] {
  /* 此主题完整的深色配色 Token，只写一份 */
}
```

默认主题也在对应的浅色、深色规则中增加自己的预览选择器。主题卡内部的预览使用背景、前景和主色变量渲染小型示意；卡片外框、选中标记和操作文字仍使用当前 App 主题。

预览不改动页面根节点，不临时切换用户的主题。它只展示配色，不承诺完整还原整个应用布局。

## 切换、保存与启动恢复

### 状态与切换

亮暗模式以 `next-themes` 为唯一状态来源，不另建一份互相同步的模式状态。主题预设由 App 主题模块维护，面板只读取状态并发起选择操作。

切换预设的完整行为为：

```text
用户选择主题
    ↓
校验 ID 属于当前清单
    ↓
更新预设状态与 html 的 data-theme
    ↓
CSS 生效，面板选中项同步变化
    ↓
保存到 localStorage
```

下面这行是应用样式的步骤，不应成为各组件自行操作主题的入口：

```js
document.documentElement.dataset.theme = 'ocean';
```

主题状态、DOM 和保存逻辑集中在主题模块处理。React 状态更新不等待网络请求；第一版也没有网络保存。

### 保存约定

| localStorage key | 内容 | 初始默认值 |
| --- | --- | --- |
| `nocobase:<scope>:theme:color-scheme` | `system`、`light` 或 `dark`，交给 `next-themes` 管理 | `system` |
| `nocobase:<scope>:theme:preset` | 当前清单中的主题 ID | `default` |

保存值使用简单字符串，无需增加版本化 JSON、迁移或历史数据兼容层。

两项偏好均按 App 的规范化挂载路径隔离，统一使用 `theme` 命名空间。通过 v3 已有的 `resolveAppBase()` 获取路径，无需增加 App 标识 API：

```ts
import { resolveAppBase } from '@nocobase/app-client';

const appPath = resolveAppBase().replace(/^\/+|\/+$/g, '');
const scope = appPath ? encodeURIComponent(appPath) : '%2F';
const colorSchemeStorageKey = `nocobase:${scope}:theme:color-scheme`;
const themePresetStorageKey = `nocobase:${scope}:theme:preset`;
```

scope 的生成规则是：去掉规范化挂载路径首尾的 `/`，再进行 URL 编码；根路径去掉斜杠后为空，使用保留值 `%2F`。

| App 挂载路径 | scope | 主题预设 key |
| --- | --- | --- |
| `/crm/` | `crm` | `nocobase:crm:theme:preset` |
| `/erp/` | `erp` | `nocobase:erp:theme:preset` |
| `/team/crm/` | `team%2Fcrm` | `nocobase:team%2Fcrm:theme:preset` |
| `/` | `%2F` | `nocobase:%2F:theme:preset` |
| `/root/` | `root` | `nocobase:root:theme:preset` |

当前 Host 的常规挂载规则是 `/${appName}`；`/team/crm/` 表示自定义的嵌套部署路径。仅去掉首尾斜杠，中间的斜杠保留并编码，避免不同路径合并为相同 scope。根路径不用 `root` 作为 scope，避免与实际的 `/root/` 应用重名。

例如 CRM 的显示模式 key 为 `nocobase:crm:theme:color-scheme`。将隔离后的显示模式 key 传给 `next-themes` 的 `storageKey`，预设状态只读写和监听自己的 key。

`resolveAppBase()` 优先读取服务端注入的 `APP_BASE_PATH`，开发环境回退到 Vite 的 `BASE_URL`，并统一前后斜杠。使用完整挂载路径，不使用当前页面的 `location.pathname`，也不截取路径第一段。在 `/crm/`、`/crm/settings` 和 `/crm/orders/123` 中应得到相同 scope。

同一 App 的页面和标签页共享偏好，同源不同路径的 App 互不影响。localStorage 已按 origin 隔离，key 无需重复域名。第一版不按账号隔离，退出或更换账号不会重置外观；不同设备、浏览器或 origin 之间不共享。

挂载路径变化后使用新的存储范围；同一路径被另一个 App 接替时，可能读取该路径以前保存的偏好。第一版接受这一部署路径语义，不增加独立实例 ID。重置某个 App 的偏好只删除它自己的 key，不调用 `localStorage.clear()`。

其他行为：

- 没有保存值：使用默认值。
- 保存的预设不在当前清单中：本次加载按默认预设显示，UI 与 DOM 一致。
- 保存的显示模式无效：按 `system` 处理。
- 读取或写入存储失败：页面正常工作，当次选择仍生效；不因此中断启动。
- 同一 App 的其他标签页收到这两个 key 的变化或清除事件时，按相同规则更新显示；忽略其他 App 的 key，不通过无条件回写形成同步循环。

无效值回退用于处理删除主题、浏览器数据被修改或同一路径重新部署后清单不匹配的正常情况，不为开发期主题建立 ID 别名和迁移记录。

### 首屏恢复（暂缓）

第一版暂不解决最初 HTML Loading 与用户所选主题不一致的问题，后续再评估方案。

保留 HTML Loading 原有的系统深浅色配色。保存的主题在 `client/index.tsx` 普通客户端启动时恢复，之后由 React Provider 管理。CSS 继续通过 JS import 加载。

不注入首屏主题恢复脚本，不内联主题变量，也不添加用于提前注入路径的空 module 标记。刷新时 Loading 与应用页面可能发生配色变化，这是当前已知限制，不作为本版阻断项。

## AI 如何维护主题

### Skill 组织

扩展两个模板已有的 `nocobase-app-development` Skill，增加 `references/themes.md`，并在主入口的任务路由表中加入“新增、修改或删除应用主题”。不需要新增独立 Skill 包。

同时更新现有 `components-and-styling.md`，让它指向主题专页，并准确描述新的外观选择 UI。模板中的 Skill 源文件随模板发布；不要编辑生成应用中同步得到的 `.agents/skills/` 副本作为来源。

### 新增主题

用户示例：“添加一个蓝色为主、低饱和度的海洋主题。”

AI 按以下步骤处理：

1. 读取主题指引、清单、默认主题 CSS 和相关现有组件，确认用户想要的视觉特点。
2. 选取唯一主题 ID，新增主题 CSS，提供完整的浅色和深色配色；复用同一规则提供卡片预览。
3. 从全局样式入口引入该文件，在静态清单中添加元数据，并补全应用支持语言的名称翻译。
4. 检查背景／文字对比度，以及表单、弹窗、导航、焦点和危险操作的辨识度。
5. 验证主题出现在面板中，能够切换并在刷新后恢复，完成适用的测试和视觉检查。

新增主题不更改用户当前选择。开发环境经正常热更新后可选；生产环境需要重新构建并部署，才对用户可用。

### 修改现有主题

AI 定位目标主题后，修改其 CSS，并同时检查浅色和深色效果。只改配色时保留主题 ID，避免将外观调整变成另一个主题；只改名称时更新翻译。

当前选择该主题的用户，在应用更新后看到修改后的样式。其他主题保持原有视觉效果；如需修改公共基础样式，明确影响范围并检查所有主题。

### 删除主题

仅在用户要求时删除主题。移除对应的清单项、CSS 引入、文件和不再使用的翻译；验证之前保存该 ID 的用户回到默认预设。

必须保留一个有效默认主题。删除或更改默认主题需要同时明确新的默认选择，不能留下空清单或不存在的默认 ID。

## 验证与验收

### 行为验收

- 首次访问默认使用默认主题和跟随系统模式。
- 浅色、深色和跟随系统三个选项均可选择；系统变化只在跟随系统时影响实际模式。
- 模式和预设独立切换，Header、独立页面及面板选中状态一致。
- 刷新后恢复所选预设和模式；无效值和存储不可用不会导致页面无法使用。
- 同源两个 App 的模式和预设互不影响；同一 App 多标签页正确响应自己的偏好变化和清除。
- 同一 App 的首页、深层路由和带查询参数的页面使用相同 scope；嵌套挂载路径和根路径也正确隔离。
- 新增主题后，面板无需改代码即可展示；删除已选主题后按默认预设显示。
- 客户端启动后恢复用户主题；最初 HTML Loading 的配色一致性和防闪色暂缓处理。
- 面板能够通过键盘操作，中文和英文等已有语言的文案完整。

### 样式验收

对每个主题分别检查浅色和深色，至少覆盖主页面、登录页、设置页、按钮、输入框、下拉菜单、弹窗以及代表性的插件页面。

检查正常、悬停、选中、禁用、焦点和错误状态；文字对比度按 WCAG AA 检查，普通文字至少 4.5:1，大字号文字至少 3:1。卡片预览与实际主题配色一致，且不会改变整页主题。

主题新增属于主要修改颜色的场景，视觉检查是必要验证，不能只依赖 DOM 单元测试。测试不固定断言当前颜色字面量，避免阻碍正常的主题调整。

### 开发检查

状态切换、保存、恢复等行为变化遵循风险分级 TDD：先增加有意义的失败测试，确认预期失败，再修改实现并验证通过。纯视觉配色调整采用最小可靠的样式和视觉检查。

复用并扩展模板已有的 `tests/logic/client-theme.test.tsx`，必要时补充浏览器验证。可增加清单与 CSS 的一致性检查，捕获重复 ID、缺失主题和不完整的亮暗配色；不要为此引入运行时 CSS 解析机制。

在源码仓库同时修改两套模板时，运行：

```bash
pnpm --filter @nocobase/app-template-default check
pnpm --filter @nocobase/app-template-hub check
```

在已生成应用内维护主题时，运行该应用的相应检查。交付说明包含关键测试结果、视觉验证范围和未执行检查的原因。

## 已确认的设计决策

以下内容已审核通过，作为第一版约定：

1. 功能整体由 App 模板维护，继续使用 `next-themes` 管理亮暗模式。
2. 主题预设与显示模式独立，使用 `data-theme` 和根节点 class 表达。
3. 使用静态主题清单和独立 CSS 文件，预览颜色复用 CSS。
4. 右上角使用 Popover、三段模式选择和两列主题卡片；默认附带默认与海洋两个主题。
5. 使用 `nocobase:<scope>:theme:color-scheme` 和 `nocobase:<scope>:theme:preset`。scope 去掉规范化 App 挂载路径首尾的 `/` 后编码，根路径使用 `%2F`；同源不同 App 隔离，同一 App 多标签页共享，不按账号隔离。
6. 首屏加载画面一致性暂缓处理；AI 主题指引随实现同步补齐。

清单字段、主题 ID 约定、预览选择器和存储范围按本文实施。后续如需新增或改变应用级 API 或约定，应说明具体调整并在获得批准后实施。
