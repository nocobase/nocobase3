---
title: NocoBase 3 的主题切换
description: App 主题的 CSS Token、外观切换、偏好存储与 AI 维护规范
---

# NocoBase 3 的主题切换

## 文档状态

主题切换、亮暗模式、按 App 隔离的偏好存储，以及颜色、圆角、字体、字号、间距和阴影 Token 已接入两套模板。主题维护和组件样式编写共用一份 AI Token 指引。

## 目标与范围

用户在页面右上角选择主题，并独立设置浅色、深色或跟随系统。选择立即生效，刷新后保留。

AI 通过修改主题 CSS 创建不同的视觉风格。用户选择完整主题，不需要分别设置字体、字号或颜色。模板默认提供 Default 和 Ocean 两个主题。

主题由 App 模板维护，包含 CSS、静态主题清单、状态、持久化和外观面板。Default 和 Hub 两套模板同步实现；生成应用后，主题由该应用独立维护。

主题支持颜色、圆角、字体、字号、间距和阴影，不负责切换组件库、图标库、导航结构或页面布局模式。调整字号和间距可能影响排版与尺寸，但不改变页面结构。账号同步、在线样式编辑器、主题市场和插件注册主题不在范围内。

`components.json` 是 shadcn CLI 的代码生成配置，不参与运行时切换。主题接入不新增内核能力或插件扩展点。

## 外观面板

右上角使用调色盘按钮，点击打开 Popover。应用首页、设置页、开发工具页和登录等独立页面复用同一入口。

面板包含两部分：

- **显示模式**：跟随系统、浅色、深色，使用单选控件。
- **主题**：两列卡片，展示主题名称、颜色预览和选中标记。

点击立即应用并保存，无需提交，面板保持打开以便比较。主题与显示模式互不改变。预览跟随实际亮暗模式；主题较多时滚动，窄屏时限制面板宽度。

支持键盘操作、Esc 关闭和焦点恢复。选中状态不能只依靠颜色，所有名称和提示支持国际化。

## 主题 Token

主题使用 shadcn 的语义颜色和圆角，结合 Tailwind 的字体、字号、间距及阴影变量。沿用标准命名，不另建一套尺寸或样式配置。

“支持某个 Token”包含三个条件：变量有有效值、工具类能够引用它、对应组件确实使用它。变量声明本身不会自动改变所有组件。

### 颜色

每个主题提供以下 31 个颜色 Token，并分别定义浅色和深色值：

| 分类 | Token |
| --- | --- |
| 页面 | `--background`、`--foreground` |
| 卡片 | `--card`、`--card-foreground` |
| 浮层 | `--popover`、`--popover-foreground` |
| 主操作 | `--primary`、`--primary-foreground` |
| 次操作 | `--secondary`、`--secondary-foreground` |
| 弱化内容 | `--muted`、`--muted-foreground` |
| 交互强调 | `--accent`、`--accent-foreground` |
| 危险操作 | `--destructive` |
| 边框与焦点 | `--border`、`--input`、`--ring` |
| 图表 | `--chart-1`、`--chart-2`、`--chart-3`、`--chart-4`、`--chart-5` |
| 侧边栏 | `--sidebar`、`--sidebar-foreground` |
| 侧边栏主操作 | `--sidebar-primary`、`--sidebar-primary-foreground` |
| 侧边栏交互强调 | `--sidebar-accent`、`--sidebar-accent-foreground` |
| 侧边栏边框与焦点 | `--sidebar-border`、`--sidebar-ring` |

无后缀的颜色表示表面，`-foreground` 表示其上的文字和图标。配对命名不保证对比度，仍需检查实际配色。危险操作保持危险语义，图表颜色需要便于区分。

### 圆角

每个主题设置一个基础值 `--radius`，通过公共映射派生圆角阶梯：

| 派生 Token | 计算方式 |
| --- | --- |
| `--radius-sm` | 基础值 × 0.6 |
| `--radius-md` | 基础值 × 0.8 |
| `--radius-lg` | 基础值 |
| `--radius-xl` | 基础值 × 1.4 |
| `--radius-2xl` | 基础值 × 1.8 |
| `--radius-3xl` | 基础值 × 2.2 |
| `--radius-4xl` | 基础值 × 2.6 |

组件使用 `rounded-sm` 至 `rounded-4xl`，主题只修改基础值，不分别覆盖派生档位。`rounded-full`、`rounded-xs` 和固定圆角不属于这套阶梯。

### 字体

| Token | 用途 | 使用方式 |
| --- | --- | --- |
| `--font-sans` | 默认正文字体 | 页面正文使用 `font-sans` |
| `--font-serif` | 衬线字体 | 需要此类字体的内容使用 `font-serif` |
| `--font-mono` | 等宽字体 | 代码等内容使用 `font-mono` |
| `--font-heading` | 标题字体 | 页面标题和标题组件使用 `font-heading` |

前三项沿用 Tailwind，标题变量参考 shadcn Create。标题默认跟随正文，也可独立配置；按钮标签和普通强调文字不自动算作标题。

正文需要显式引用字体 Token，不能保留固定的 `font-family`。标题样式只作用于实际标题，不全局覆盖所有粗体文字或所有组件。

自定义字体必须先通过字体包或本地 `@font-face` 加载，CSS 变量只负责选择字体。字体栈提供中文与系统回退；检查授权、字重、资源体积和加载失败时的显示。不要为主题预装全部候选字体，也不要在点击主题时才安装依赖。

### 字号与行高

支持 Tailwind 的以下字号档位：

```text
--text-xs
--text-sm
--text-base
--text-lg
--text-xl
--text-2xl ～ --text-9xl
```

每档同时定义配套的 `--text-<档位>--line-height`，例如 `--text-sm--line-height`。字号优先使用 `rem`，配套行高使用有效的无单位比例，避免文字放大后被裁切。

组件使用 `text-sm`、`text-base` 等类。正文显式使用 `text-base`，不能假定改变量会改变没有字号类的元素。单独的 `leading-*` 或 `text-sm/6` 会覆盖字号自带的行高，需要逐处检查，不能承诺全部随配套行高变化。

字重、字间距和独立的行高工具类仍保留现有规则，不作为主题必配参数。

### 间距与尺寸

使用基础变量 `--spacing`，默认值为 `0.25rem`。Tailwind 的数值型间距和尺寸类通常由它计算：

| 工具类 | 计算方式 |
| --- | --- |
| `p-4` | 内边距为基础值 × 4 |
| `gap-2` | 间隔为基础值 × 2 |
| `h-8` | 高度为基础值 × 8 |
| `size-4` | 宽高为基础值 × 4 |

调整它会同时影响内外边距、图标和部分控件尺寸，甚至 `w-64` 侧边栏宽度，因此不是单纯的“内容紧凑度”开关。

百分比、视口单位、固定像素、容器宽度和响应式断点不自动跟随它。保留有明确用途的固定尺寸；常规控件中的无意硬编码应改用已有标准类。不另加未经设计的控件高度或密度变量。

字号与间距需要一起验收，确保按钮、输入框、表格等不会裁切文字，且交互目标仍足够大。不通过修改根字号间接缩放整个应用。

### 阴影

支持普通盒阴影档位：

```text
--shadow-2xs
--shadow-xs
--shadow-sm
--shadow-md
--shadow-lg
--shadow-xl
--shadow-2xl
```

组件使用对应的 `shadow-*` 类。主题可调整阴影层次，也可为深色模式提供不同值。关闭某档阴影时使用有效的零阴影值，例如 `0 0 #0000`，并验证 Tailwind 阴影组合结果。

`shadow-none` 和固定阴影可以绕过主题档位。主题阴影值包含颜色，不依赖独立的 `shadow-black/30` 等颜色类重新着色。内阴影、文字阴影、`drop-shadow` 和焦点环不纳入普通盒阴影档位；不要为了去除阴影而移除键盘焦点提示。

## CSS 与组件接入

### 文件组织

```text
client/
├── styles.css                 CSS 入口、Tailwind 映射和基础样式
├── theme/
│   ├── theme-presets.ts        主题清单、默认主题和 ID 类型
│   ├── theme-provider.tsx      亮暗模式与主题状态
│   ├── theme-settings.tsx      外观面板
│   └── themes/
│       ├── default.css        默认主题 Token
│       └── ocean.css          海洋主题 Token
└── locales/                   主题名称与界面翻译
```

主题值保存在 CSS，不复制到 TypeScript。公共映射和组件规则放在 `client/styles.css`，各主题只提供值。

默认主题首先引入，其后引入其他主题。每个主题提供完整的颜色、字体、字号及配套行高、基础间距、基础圆角和盒阴影值，确保切换到它时不残留其他主题的样式。

颜色分别定义亮暗值；字体、字号、间距、圆角和阴影可以在该主题的基础规则中定义，由深色规则沿用，需要差异时再覆盖。默认主题也遵循这条规则，不在全局深色规则中加入其他主题无法重置的私有样式。

### 选择器与预览

```css
/* Partial example; each preset supplies the complete token set. */
:root[data-theme='ocean'],
.theme-preview[data-theme='ocean'] {
  --background: oklch(0.985 0.025 245);
  --foreground: oklch(0.16 0.025 245);
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-heading: var(--font-sans);
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.5;
  --spacing: 0.25rem;
  --radius: 0.5rem;
  --shadow-sm: 0 1px 3px rgb(0 0 0 / 12%);
}

:root.dark[data-theme='ocean'],
:root.dark .theme-preview[data-theme='ocean'] {
  --background: oklch(0.13 0.025 245);
  --foreground: oklch(0.96 0.025 245);
}
```

默认主题额外提供 `:root` 和 `:root.dark` 回退。其他主题不得复制默认主题的裸根选择器。

预览容器复用同一份 Token，不修改根节点。迷你侧边栏使用侧边栏配色，卡片外框、名称和选中标记使用当前 App 主题。颜色缩略图不承诺完整还原字体、密度和页面布局。

### Tailwind 映射

shadcn 颜色使用 `@theme inline` 映射到 `--color-*`，圆角使用同一处的派生公式：

```css
@theme inline {
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --radius-md: calc(var(--radius) * 0.8);
}
```

Tailwind 已有的字体、字号和间距名称复用原有工具类机制；主题值在根节点和预览选择器中覆盖。不要在 `@theme inline` 中把这些可切换值写成固定常量，也不要写同名变量自引用。

命名盒阴影在当前 Tailwind 编译器中会展开为固定值。公共 CSS 取消七档内置阴影的编译期定义，并用同名 `@utility` 转接到 `shadow-(--shadow-档位)`。组件仍使用 `shadow-sm` 等标准类，生成的 CSS 保留运行时变量及 Tailwind 的焦点环组合。主题文件只改阴影值，不复制转接规则。

标题字体通过普通 `@theme` 声明，使 `font-heading` 工具类可用：

```css
@theme {
  --font-heading: var(--font-sans);
}
```

每个主题和预览容器仍显式定义 `--font-heading`，确保“跟随正文”在正确作用域解析。基础样式让正文使用 `font-sans text-base`，标题和代码分别接入相应字体。

最终以生成的 CSS 和浏览器计算样式为准：工具类必须保留对运行时变量的引用。存在变量名不等于已完成接入，未使用的类也不必强制出现在生产 CSS 中。

### 组件使用

现有 shadcn 组件已经大量使用 `text-sm`、`h-8`、`px-2.5`、`shadow-md` 等类，应优先复用，避免重写组件。

接入时重点处理：

- 页面正文的固定字体栈，以及页面标题、代码区域的字体应用。
- `text-[0.8rem]`、固定间距或固定阴影等覆盖项。可使用标准档位的改用标准类；有明确视觉用途的保留并说明边界。
- 单独行高、阴影颜色、尺寸上限等对主题变量的覆盖。
- Portal 浮层继承根主题，局部预览使用自己的主题变量，二者分别验证。

主侧边栏及设置、开发工具侧边栏采用独立颜色：

| 元素 | 工具类 |
| --- | --- |
| 背景和默认文字 | `bg-sidebar text-sidebar-foreground` |
| 当前选中项 | `bg-sidebar-primary text-sidebar-primary-foreground` |
| 非选中项悬停与分组交互 | `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground` 等状态类 |
| 边框和分隔线 | `border-sidebar-border` |
| 可见焦点 | `focus-visible:ring-sidebar-ring` 等焦点类 |

页脚、关闭按钮和移动抽屉同样接入。复用组件通过已有 `className` 设置局部样式，不新增侧边栏专用 props，不覆盖通用颜色变量来模拟侧边栏主题。

图表显式使用 `fill-chart-1`、`stroke-chart-1` 或 `var(--chart-1)`。当前模板没有产品图表，使用最小 SVG 测试样例验证，不为 Token 接入新建图表页面。

主题不会重绘 Logo 图片，也不会自动控制 iframe、第三方独立样式或硬编码的插件界面。对这些内容单独确认支持范围，不使用全局选择器强制覆盖。

## 切换与保存

### 状态

显示模式由 `next-themes` 管理，预设由 App 主题模块管理：

```html
<html class="dark" data-theme="ocean">
```

`class` 表示实际亮暗模式，`data-theme` 表示预设。跟随系统时保存值为 `system`，实际 class 为 `light` 或 `dark`。

选择预设时校验 ID，更新状态和根节点，再保存偏好。DOM 操作集中在主题模块，各组件不自行设置根节点或维护另一份主题状态。

### 主题清单

```ts
export const themePresets = [
  { id: 'default', labelKey: 'appearance.themes.default' },
  { id: 'ocean', labelKey: 'appearance.themes.ocean' },
] as const;

export type ThemePresetId = (typeof themePresets)[number]['id'];

export const defaultThemePreset: ThemePresetId = 'default';
```

ID 唯一，使用小写 kebab-case，与 CSS 一致。清单顺序就是展示顺序；新增主题只需补 CSS、引入、清单和翻译，不修改面板组件。不通过解析 CSS 自动发现主题。

### 存储隔离

| key | 值 | 默认值 |
| --- | --- | --- |
| `nocobase:<scope>:theme:color-scheme` | `system`、`light`、`dark` | `system` |
| `nocobase:<scope>:theme:preset` | 主题 ID | `default` |

通过 `resolveAppBase()` 取得规范化挂载路径，移除首尾斜杠后编码；根路径使用 `%2F`：

```ts
const appPath = resolveAppBase().replace(/^\/+|\/+$/g, '');
const scope = appPath ? encodeURIComponent(appPath) : '%2F';
```

| 挂载路径 | scope |
| --- | --- |
| `/crm/` | `crm` |
| `/team/crm/` | `team%2Fcrm` |
| `/` | `%2F` |
| `/root/` | `root` |

保留并编码中间的斜杠，避免路径冲突。不使用当前页面路径或第一段路径；同一 App 的首页和深层路由必须得到相同 key。

`resolveAppBase()` 使用服务端注入的 `APP_BASE_PATH`，开发环境回退到 Vite 的 `BASE_URL`。localStorage 已按 origin 隔离，不必重复域名。

同源不同挂载路径互不影响，同一 App 的标签页共享偏好。不按账号隔离，不跨设备同步。挂载路径变化后使用新范围；同一路径重新部署可能沿用原偏好。

没有保存值时使用默认值；无效主题回退到 Default，无效显示模式回退到 system。存储不可用时页面仍能使用，当次选择仍生效。

监听本 App 两个 key 的变更和清除事件，同步其他标签页；忽略其他 App 的 key，避免回写循环。重置只删除自己的 key，不调用 `localStorage.clear()`。不增加开发期数据迁移或 ID 别名。

### 启动恢复

主题在 `client/index.tsx` 普通客户端启动阶段恢复，再交给 React Provider 管理。CSS 通过 JS import 加载。

最初 HTML Loading 使用原有系统亮暗配色，可能与保存的主题不同。首屏配色一致性为已知限制，暂不引入额外的内联恢复脚本或主题 CSS。

## AI 维护流程

两套模板的 `skills/nocobase-app-development/references/theme-tokens.md` 统一说明 Token 名称、含义、值格式、工具类、资源要求和例外。Skill 入口、App 和客户端指引都链接到这份参考，避免维护多份清单。

- 创建或编辑主题：阅读 `themes.md` 和共享 Token 参考，了解如何提供主题值。
- 编写组件或页面样式：阅读 `components-and-styling.md` 和共享 Token 参考，优先使用语义颜色、标准字号、间距、圆角和阴影类。

允许有明确用途的固定值，但需要说明哪些样式不会跟随主题；不把“变量已声明”等同于“所有组件都会自动适配”。

### 新增主题

1. 阅读主题规范、默认 CSS 和相关组件，确认视觉目标。
2. 复制默认主题，使用唯一 ID，补齐全部 Token 和亮暗差异，保留预览选择器。
3. 使用新字体时添加必要资源和回退字体。
4. 从 `client/styles.css` 引入文件，添加清单项和所有支持语言的名称。
5. 验证颜色、字体、字号、间距、圆角、阴影及保存恢复。

新增主题不自动改变用户选择。开发环境通过正常热更新加载，生产环境重新构建部署后可用。

### 修改和删除

修改外观时保留主题 ID，只调整该主题的值；修改名称时更新翻译。新增共享 Token 或改变组件使用约定，需要先审核设计，不能混入普通主题调整。

删除主题时同步移除清单项、CSS 文件与引入，以及无用翻译。必须保留有效默认主题，并验证保存了被删除 ID 的用户能够回退。

AI 不通过修改 `components.json` 或堆叠页面选择器实现主题，不修改内核或插件接口。主题接入规则稳定后，日常定制应主要发生在主题 CSS。

## 实施安排

保持现有 18 个通用颜色值和基础圆角值。新增字体、字号、间距和阴影优先采用当前应用或 Tailwind 默认值，减少无关视觉变化。

| 范围 | 接入内容 |
| --- | --- |
| `client/theme/themes/*.css` | 完整颜色及非颜色 Token、亮暗和预览作用域 |
| `client/styles.css` | 颜色与圆角映射、标题字体声明、正文基础样式及运行时阴影转接 |
| `client/shell/app-sidebar.tsx`、`client/layouts/surface-layout.tsx` | 独立侧边栏配色 |
| `client/theme/theme-settings.tsx` | 迷你侧边栏预览 |
| 标题、代码区域和基础组件 | 字体接入及影响主题的固定值检查 |
| 主题 Skill 与样式指引 | 完整 Token 清单、资源加载和使用规则 |
| `tests/` | 变量、CSS 编译、组件和主题行为验证 |

圆角从加减固定像素改为统一比例，会使已有档位略有变化；新增大圆角映射也会改变原来使用 Tailwind 默认值的元素。侧边栏选中项采用独立的背景与文字配对，不再固定为主色的 10%。这些变化需要视觉验收。

实施顺序为：测试暴露缺口、补变量与映射、接入组件、更新 AI 指引、完成回归验证。两套模板一起交付；涉及新的公共配置、props 或扩展点时，先审核再实现。

## 验证与验收

- **完整性**：所有主题包含完整 Token，亮暗差异和预览作用域正确；不固定断言品牌颜色字面量。
- **CSS 编译**：最小样例覆盖标准字体、全部字号及行高、间距、七档圆角和盒阴影，确认工具类保留运行时变量引用。
- **浏览器效果**：切换 Default / Ocean 与 Light / Dark，检查根节点、预览及 Portal 的实际样式。测试用变量值要有明显差异，避免“切换成功但样式没变”。
- **字体和排版**：检查中文、英文、代码、标题、长文本、字体加载失败、浏览器缩放和窄屏；无文字裁切、重叠或不可用的交互目标。
- **间距与阴影**：改变基础间距后检查按钮、输入框、侧边栏和表格；检查浮层阴影、层次与键盘焦点不会互相覆盖。
- **颜色和圆角**：覆盖正常、悬停、选中、禁用、焦点和错误状态；检查侧边栏、图表样例、Logo、登录页和代表性插件页面。普通文字对比度至少 4.5:1，大字号文字至少 3:1；基础圆角为零时七档都应归零。
- **行为**：预设与模式独立、刷新恢复、无效值回退、存储不可用、同 App 多标签页同步、同源不同 App 隔离、主题增删和键盘操作正确。

行为变化遵循风险分级 TDD：先确认测试按预期失败，再修改实现并验证通过。视觉调整采用实际样式和浏览器检查，不用大量入口 mock 代替样式验证，不引入运行时 CSS 解析机制。

复用主题偏好、主题 UI、App Shell 等相关测试。两套模板分别运行检查，完整构建顺序执行：

```bash
pnpm --filter @nocobase/app-template-default check
pnpm --filter @nocobase/app-template-hub check
```

发布内容变化时同步维护 changeset。交付记录包含测试命令、结果、视觉覆盖范围和未执行检查的原因。

## 参考资料

- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)
- [Tailwind Theme variables](https://tailwindcss.com/docs/theme)
- [Tailwind Font family](https://tailwindcss.com/docs/font-family)
- [Tailwind Font size](https://tailwindcss.com/docs/font-size)
- [Tailwind Box shadow](https://tailwindcss.com/docs/box-shadow)
