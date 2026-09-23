---
title: '主题变量'
description: 'NocoBase 3 主题变量参考：颜色、字体、字号、间距、圆角和阴影，以及对应的 Tailwind 工具类。'
keywords: 'NocoBase 3,主题变量,颜色,字体,字号,间距,圆角,阴影,Tailwind'
---

# 主题变量

NocoBase 应用的主题由 CSS 变量组成。在 `client/theme/themes/` 中定义主题预设，在 `client/styles.css` 中把这些变量映射到 Tailwind。组件优先使用这些语义化变量，这样切换主题或颜色模式时可以保持一致。

当前实现以 `client/theme/themes/default.css` 和 `client/theme/themes/compact.css` 为准。两套预设共用颜色、字体和阴影，只在间距、圆角以及部分字号行高上有所区别。

## 主题预设和颜色模式

预设 ID 注册在 `client/theme/theme-presets.ts` 中，当前有两项：

| ID        | 说明                                        |
| --------- | ------------------------------------------- |
| `default` | 常规间距和圆角，`--spacing` 为 `0.25rem`    |
| `compact` | 更紧凑的间距和圆角，`--spacing` 为 `0.2rem` |

预设和颜色模式是两个独立的选择。`next-themes` 负责 `light`、`dark` 和 `system`，预设只通过根元素上的 `data-theme` 选择 CSS 变量。比如，当前页面可能同时具有 `class="dark" data-theme="compact"`。

应用可以在 `config.yml` 中设置 `client.app.defaultColorScheme` 和 `client.app.defaultTheme` 作为首次启动的默认值。当前浏览器保存的有效选择会分别覆盖这两个默认值；缺少或无效的配置会回退到 `system` 和注册列表中的第一项预设。选择保存在浏览器本地。

主题文件需要同时覆盖页面和预览卡片。下面的代码只展示选择器和两个颜色变量，实际预设仍需定义本页列出的全部 token：

```css
/* 浅色规则：页面和主题预览使用同一组变量 */
:root[data-theme='forest'],
.theme-preview[data-theme='forest'] {
  --background: oklch(0.98 0.01 145);
  --foreground: oklch(0.2 0.02 145);
}

/* 深色规则：颜色模式由根元素上的 dark class 表示 */
:root.dark[data-theme='forest'],
:root.dark .theme-preview[data-theme='forest'] {
  --background: oklch(0.18 0.02 145);
  --foreground: oklch(0.96 0.01 145);
}
```

`default.css` 为应用根节点保留了不带 `data-theme` 的 `:root` 兜底规则。新增预设时不要复制这个裸选择器，避免自定义值在没有匹配 `data-theme` 时应用到全局根节点。

## 颜色

颜色变量的值是完整的 CSS 颜色，当前预设使用 OKLCH。每个预设都要在浅色和深色规则中定义下面的 31 个变量。成对出现的 `foreground` 变量用于同一表面上的文字和图标，实际配色仍需检查对比度。

| 变量                                                | 用途                       |
| --------------------------------------------------- | -------------------------- |
| `--background`、`--foreground`                      | 页面底色和默认文字         |
| `--card`、`--card-foreground`                       | 卡片和面板                 |
| `--popover`、`--popover-foreground`                 | 菜单、弹窗等浮层           |
| `--primary`、`--primary-foreground`                 | 主要操作及其文字           |
| `--secondary`、`--secondary-foreground`             | 次要操作及其文字           |
| `--muted`、`--muted-foreground`                     | 弱化表面和辅助文字         |
| `--accent`、`--accent-foreground`                   | 悬停、选中等交互高亮       |
| `--destructive`                                     | 删除、错误等危险状态       |
| `--border`、`--input`、`--ring`                     | 通用边框、输入控件和焦点环 |
| `--chart-1` 到 `--chart-5`                          | 五组图表序列颜色           |
| `--sidebar`、`--sidebar-foreground`                 | 侧边栏底色和文字           |
| `--sidebar-primary`、`--sidebar-primary-foreground` | 侧边栏主要或选中项         |
| `--sidebar-accent`、`--sidebar-accent-foreground`   | 侧边栏悬停或高亮项         |
| `--sidebar-border`、`--sidebar-ring`                | 侧边栏边框和焦点环         |

`--destructive` 没有配套的 `--destructive-foreground`。需要前景色时，选择适合当前表面的语义类，并在两种颜色模式下检查可读性。

组件使用与变量对应的语义化工具类：

```tsx
// 使用语义颜色，组件不需要为深色模式重复写颜色
<div className='border-border bg-card text-card-foreground'>
  <p className='text-muted-foreground'>订单列表</p>
  <button className='bg-primary text-primary-foreground'>保存</button>
</div>
```

常用对应关系包括 `bg-card`、`text-card-foreground`、`border-input`、`ring-ring`、`bg-sidebar` 和 `text-sidebar-foreground`。图表颜色需要显式指定，比如使用 `fill-chart-1`、`stroke-chart-2` 或 `var(--chart-1)`；图表库不会自动读取这些变量。变量已经是完整颜色时，不要再包一层 `hsl()`。

侧边栏变量可以引用同一预设中的通用变量，但它们仍是独立的 token。只想调整侧边栏时，修改 `--sidebar-*`，不要重定义通用颜色。

## 字体

| 变量             | 当前含义                                   | 对应工具类                                        |
| ---------------- | ------------------------------------------ | ------------------------------------------------- |
| `--font-sans`    | 带中文回退的系统无衬线字体栈，页面正文字体 | `font-sans`、`body`                               |
| `--font-serif`   | 带中文回退的系统衬线字体栈                 | `font-serif`                                      |
| `--font-mono`    | 系统等宽字体栈                             | `font-mono`、`code`、`pre`、`kbd`、`samp`         |
| `--font-heading` | 标题字体，当前值为 `var(--font-sans)`      | `font-heading`、`h1` 到 `h6`、`PopoverTitle` 组件 |

这些变量的值是 CSS `font-family` 列表，不是字号或字体文件地址。当前 `--font-sans` 包含 `PingFang SC` 和 `Microsoft YaHei` 等中文回退字体，`--font-serif` 包含 `Songti SC` 和 `SimSun` 等回退字体。`client/styles.css` 将 `body` 连接到 `font-sans`，将 `h1` 到 `h6` 连接到 `font-heading`，将代码相关元素连接到 `font-mono`。标题如果使用其他元素渲染，需要显式添加 `font-heading`。

如果引入新的字体，需要同时提供字体资源，比如本地 `@font-face` 或客户端字体依赖，再把实际的 family 名写入变量。检查中文覆盖、字重、授权、加载成本和回退字体；只修改变量而不加载字体，浏览器不会得到新的字体。

## 字号和行高

每档字号由两个变量组成：`--text-<size>` 和 `--text-<size>--line-height`。字号使用 `rem`，行高是无单位的计算值。下面是 `default` 预设的值；`compact` 使用相同字号，但把 `sm` 到 `4xl` 的行高调得更紧凑。

| 字号   | `--text-*` | `default` 行高       | `compact` 行高      |
| ------ | ---------- | -------------------- | ------------------- |
| `xs`   | `0.75rem`  | `calc(1 / 0.75)`     | `calc(1 / 0.75)`    |
| `sm`   | `0.875rem` | `calc(1.25 / 0.875)` | `calc(1.2 / 0.875)` |
| `base` | `1rem`     | `calc(1.5 / 1)`      | `calc(1.4 / 1)`     |
| `lg`   | `1.125rem` | `calc(1.75 / 1.125)` | `calc(1.6 / 1.125)` |
| `xl`   | `1.25rem`  | `calc(1.75 / 1.25)`  | `calc(1.6 / 1.25)`  |
| `2xl`  | `1.5rem`   | `calc(2 / 1.5)`      | `calc(1.8 / 1.5)`   |
| `3xl`  | `1.875rem` | `calc(2.25 / 1.875)` | `calc(2.1 / 1.875)` |
| `4xl`  | `2.25rem`  | `calc(2.5 / 2.25)`   | `calc(2.3 / 2.25)`  |
| `5xl`  | `3rem`     | `1`                  | `1`                 |
| `6xl`  | `3.75rem`  | `1`                  | `1`                 |
| `7xl`  | `4.5rem`   | `1`                  | `1`                 |
| `8xl`  | `6rem`     | `1`                  | `1`                 |
| `9xl`  | `8rem`     | `1`                  | `1`                 |

使用 `text-xs` 到 `text-9xl`。页面默认使用 `text-base`。单独的 `leading-*` 或 `text-sm/6` 会覆盖字号变量提供的行高；`text-[14px]` 这类任意值也不会使用这套刻度，只有在确实需要固定尺寸时才使用。

## 间距

`--spacing` 是数字工具类使用的基础长度：

| 预设      | `--spacing` |
| --------- | ----------- |
| `default` | `0.25rem`   |
| `compact` | `0.2rem`    |

`p-4`、`gap-2`、`h-8`、`size-4` 和 `w-64` 等工具类会把后缀数字乘以 `--spacing`，编译结果类似 `calc(var(--spacing) * 4)`。修改它会同时影响内边距、元素间距、控件和图标尺寸，以及部分导航尺寸。

百分比、视口单位、容器宽度和固定像素值不一定使用这套刻度。图片尺寸、分隔线和明确的视口限制需要固定值时可以保留，不要通过修改根字号来模拟紧凑布局。

## 圆角

`--radius` 是圆角工具类的基础长度：

| 预设      | `--radius` |
| --------- | ---------- |
| `default` | `0.5rem`   |
| `compact` | `0.25rem`  |

`client/styles.css` 根据它生成以下七档圆角：

| 工具类        | 计算方式                    |
| ------------- | --------------------------- |
| `rounded-sm`  | `calc(var(--radius) * 0.6)` |
| `rounded-md`  | `calc(var(--radius) * 0.8)` |
| `rounded-lg`  | `var(--radius)`             |
| `rounded-xl`  | `calc(var(--radius) * 1.4)` |
| `rounded-2xl` | `calc(var(--radius) * 1.8)` |
| `rounded-3xl` | `calc(var(--radius) * 2.2)` |
| `rounded-4xl` | `calc(var(--radius) * 2.6)` |

修改预设时只需要调整 `--radius`。`rounded-full`、`rounded-xs` 和显式指定单个角不属于这七档推导关系。

## 阴影

主题预设定义七个阴影变量：

`--shadow-2xs`、`--shadow-xs`、`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--shadow-xl` 和 `--shadow-2xl`。

默认值记录在 `default.css` 和 `compact.css` 中，两套预设目前相同。组件使用 `shadow-2xs` 到 `shadow-2xl`，需要取消层级时使用 `shadow-none`。

Tailwind 通常会把具名阴影编译成固定值。`client/styles.css` 先声明这些名称，再为每一档提供 `@utility`，把它们连接到 `var(--shadow-*)`，所以运行时切换预设仍然有效。修改主题时保留这些适配工具，不要用固定阴影覆盖变量；阴影值本身已经包含颜色。

内阴影、文字阴影、`drop-shadow` 和焦点环属于其他机制。去掉阴影时不要同时删除键盘焦点指示。

## Tailwind 映射和扫描

`client/styles.css` 使用 `@theme inline` 把主题变量映射到 Tailwind。例如：

```css
@theme inline {
  --color-card: var(--card);
  --color-chart-1: var(--chart-1);
  --radius-lg: var(--radius);
}
```

因此 `bg-card`、`fill-chart-1` 和 `rounded-lg` 会保留对运行时变量的引用。测试文件 `tests/logic/theme-tokens.test.ts` 会检查颜色、字体、字号、间距、圆角和阴影的映射是否仍然成立。

Tailwind v4 会扫描应用代码；`styles.css` 还通过 `@source "./components/ui"` 显式纳入基础 UI 组件目录。`tailwind.config.mjs` 另外解析已安装的 `@nocobase/app-client` 和 `@nocobase/app-plugin-*`，覆盖它们的 `client`、`dist/client`、`src`、`dist/src` 和 `registry` 目录。新增应用自己的 `client/` 文件通常不需要改配置。动态拼接且没有完整 class 名的字符串不会被扫描，需要改成完整 class 或使用 Tailwind 的 source 机制。

## 修改和验证主题

修改现有主题时，编辑对应的 `client/theme/themes/<id>.css`，保留 `theme-presets.ts` 中的 ID。新增预设时需要同时完成以下内容：

- 在主题 CSS 中定义全部颜色、字体、字号及行高、间距、圆角和阴影
- 在浅色和深色选择器中定义全部颜色，并让 `.theme-preview` 使用同一组变量
- 在 `client/styles.css` 中导入主题文件
- 在 `client/theme/theme-presets.ts` 中注册 ID 和翻译 key，并补充各语言的名称

完成后在应用项目根目录运行下面的测试：

```bash
pnpm exec vitest run tests/logic/theme-tokens.test.ts tests/logic/theme-preferences.test.ts tests/logic/client-theme.test.tsx
```

再在浏览器中检查浅色、深色、窄屏布局、长文本和键盘焦点。新增字体还要检查实际字体资源是否已加载。主题预设的完整创建、修改和删除流程见[主题](../capabilities/theme)。

## 相关链接

- [界面和样式](../app/components-and-styling)：使用组件和主题变量编写页面
- [主题](../capabilities/theme)：新增、修改和删除主题预设
