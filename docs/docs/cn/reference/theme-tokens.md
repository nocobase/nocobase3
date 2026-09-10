---
title: '主题变量'
description: '主题变量的完整清单：颜色、字体、字号、间距、圆角和阴影，以及它们对应的 Tailwind 工具类。'
keywords: 'NocoBase,主题变量,颜色变量,字体,字号,间距,圆角,阴影,Tailwind'
---

# 主题变量

主题变量是组件作者和主题作者共用的一份契约。应用拥有这些 CSS 变量，定义在 `client/theme/themes/*.css` 里，由 `client/styles.css` 接到 Tailwind。默认值以 `default.css` 为准，不要从别处的 shadcn 预设里抄。

## 颜色

取值是完整的 CSS 颜色（通常是 OKLCH），不是 HSL 通道值，浅色和深色规则里各定义一份。surface / foreground 这类成对的变量控制背景和它上面的文字或图标，对比度要自己检查，不要假设成对就一定可读。

| 变量                                                | 含义和用途                       |
| --------------------------------------------------- | -------------------------------- |
| `--background`、`--foreground`                      | 页面底色和默认文字               |
| `--card`、`--card-foreground`                       | 卡片和面板                       |
| `--popover`、`--popover-foreground`                 | 浮层菜单和 popover               |
| `--primary`、`--primary-foreground`                 | 主操作                           |
| `--secondary`、`--secondary-foreground`             | 次要操作                         |
| `--muted`、`--muted-foreground`                     | 弱化底色和辅助文字               |
| `--accent`、`--accent-foreground`                   | 交互高亮底色                     |
| `--destructive`                                     | 危险操作和错误                   |
| `--border`、`--input`、`--ring`                     | 通用边框、输入框边框和底色、焦点 |
| `--chart-1` 到 `--chart-5`                          | 五组图表配色                     |
| `--sidebar`、`--sidebar-foreground`                 | 导航底色和文字                   |
| `--sidebar-primary`、`--sidebar-primary-foreground` | 选中的导航项                     |
| `--sidebar-accent`、`--sidebar-accent-foreground`   | 导航悬停状态                     |
| `--sidebar-border`、`--sidebar-ring`                | 导航分隔线和焦点                 |

用 `bg-card text-card-foreground`、`border-input`、`ring-ring`、`bg-sidebar text-sidebar-foreground` 这样的语义类。图表必须显式引用 `fill-chart-1`、`stroke-chart-2` 或 `var(--chart-1)`，图表库不会自己挑这些变量。不要把完整的颜色再套一层 `hsl()`。

导航变量可以在同一套预设内引用通用颜色，但仍然各自可配置。不要为了改导航外观而重定义通用色板。

## 字体

| 变量             | 默认值或含义                             | 对应工具类                             |
| ---------------- | ---------------------------------------- | -------------------------------------- |
| `--font-sans`    | 带中日韩回退的系统无衬线字体栈，正文字体 | `font-sans`、body                      |
| `--font-serif`   | 带中日韩回退的系统衬线字体栈             | `font-serif`                           |
| `--font-mono`    | 系统等宽字体栈                           | `font-mono`、code/pre/kbd/samp         |
| `--font-heading` | `var(--font-sans)`，可以换成独立的字体栈 | `font-heading`、h1 到 h6、PopoverTitle |

取值是合法的 CSS font-family 列表，不是字号，也不是字体 URL。主题选择器要就地定义 heading 别名，包括预览，让它解析到当前预设的正文字体。

字体不只需要变量，还需要资源。用外部字体要加客户端字体依赖或本地 `@font-face`，然后引用它真实的 family 名。要确认授权、字重、中日韩覆盖、加载成本和回退渲染。本地字体按需加 `font-display: swap`，不要在切换主题时才去加载字体。

标题组件用语义化的标题元素或 `font-heading`。普通加粗文字和按钮文案仍然是正文字体，代码仍然是等宽字体。

## 字号和行高

每个字号有两个变量：`--text-<size>` 和 `--text-<size>--line-height`。字号用 rem，行高用无单位比值。

| 字号 | 默认 rem | 默认行高     |
| ---- | -------- | ------------ |
| xs   | 0.75     | 1 / 0.75     |
| sm   | 0.875    | 1.25 / 0.875 |
| base | 1        | 1.5          |
| lg   | 1.125    | 1.75 / 1.125 |
| xl   | 1.25     | 1.75 / 1.25  |
| 2xl  | 1.5      | 2 / 1.5      |
| 3xl  | 1.875    | 2.25 / 1.875 |
| 4xl  | 2.25     | 2.5 / 2.25   |
| 5xl  | 3        | 1            |
| 6xl  | 3.75     | 1            |
| 7xl  | 4.5      | 1            |
| 8xl  | 6        | 1            |
| 9xl  | 8        | 1            |

用 `text-xs` 到 `text-9xl`，正文用 `text-base`。单独的 `leading-*` 类或 `text-sm/6` 会覆盖关联的行高。`text-[14px]` 这类固定值不走这套比例，除非确实是有意为之，否则用标准字号。

## 间距

`--spacing` 是一个正值 CSS 长度，初始为 `0.25rem`。`p-4`、`gap-2`、`h-8`、`size-4`、`w-64` 这样的类把后缀数字乘上它。

改动它会同时影响内边距、间距、控件和图标尺寸、导航宽度。字体和间距要一起验证：文字不能被裁切，点击目标仍然要够用。百分比、视口单位、容器宽度和固定像素值不都走这套比例。断点不受影响。

普通间距和尺寸用数字工具类。视口限制、图片、分隔线这类有意固定的东西保留固定值，不要为了模拟密度去改根字号，也不要临时引入高度变量。

## 圆角

`--radius` 是一个非负 CSS 长度，初始为 `0.5rem`。公开的工具类由它推导：

| 工具类        | 倍数 |
| ------------- | ---- |
| `rounded-sm`  | 0.6  |
| `rounded-md`  | 0.8  |
| `rounded-lg`  | 1    |
| `rounded-xl`  | 1.4  |
| `rounded-2xl` | 1.8  |
| `rounded-3xl` | 2.2  |
| `rounded-4xl` | 2.6  |

改基础变量，不要逐个改推导出来的 `--radius-*`。设成 0 时这七档全部变成直角。`rounded-full`、`rounded-xs` 和显式指定单个角不在这个比例里，小控件可以有意给推导出的圆角封顶。

## 阴影

定义 `--shadow-2xs`、`--shadow-xs`、`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--shadow-xl`、`--shadow-2xl` 七个。取值是 CSS box-shadow 列表，包含长度和颜色，默认值与 Tailwind 一致。

组件用 `shadow-2xs` 到 `shadow-2xl`。`client/styles.css` 为它们提供了小型适配工具类，因为 Tailwind 会把有名阴影编译成固定值。这些适配类和它们的 ring 组合要保留，主题只改取值。阴影颜色由变量自己拥有，不要再叠一个 `shadow-black/30` 去改色。

`shadow-none` 是有意取消层级。内阴影、文字阴影、drop shadow 和焦点环是另外的机制，不是这七档。去掉层级时不能顺手去掉键盘焦点指示。

## 作用范围

每套预设在自己的基础规则里定义全部颜色和非颜色变量。深色规则定义全部颜色，也可以覆盖非颜色值，否则继承该预设的基础值。`.theme-preview` 遵循同一套规则。

不要整个重置 Tailwind 命名空间，也不要靠逐页覆盖来拼出一套主题。

## 对应工具类怎么写

```tsx
// 卡片：底色和文字成对使用
<div className='rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm'>
  <h2 className='font-heading text-lg'>订单</h2>
  <p className='text-sm text-muted-foreground'>共 12 条</p>
</div>
```

```tsx
// 图表：显式引用图表变量
<Bar dataKey='total' fill='var(--chart-1)' />
```

写了变量名不等于就生效。改完要确认编译后的工具类仍然保留运行时引用，再用明显不同的测试值在浏览器里核对实际样式，同时检查固定字体、固定间距、显式行高、受限控件和弹层内容。图片、iframe、第三方隔离样式和写死颜色的插件内容不会自动跟随主题。

## 相关链接

- [界面和样式](../app/components-and-styling)：组件怎么选、样式怎么写。
- [主题](../capabilities/theme)：新增、修改和删除主题预设。
