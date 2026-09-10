---
title: '界面和样式'
description: '用 shadcn/ui 组件拼界面，用语义化的主题变量写样式，让浅色深色和换主题都自动跟着走。'
keywords: 'NocoBase,组件,样式,shadcn,主题变量,深色模式,Tailwind'
---

# 界面和样式

应用的界面由 shadcn/ui 的基础组件拼出来，样式走语义化的主题变量——`bg-background`、`text-muted-foreground`、`border-border` 这类。这些变量在每套主题的浅色和深色规则里都定义了一份，所以用对它，深色模式和换主题都是自动生效的。

## 组件从哪来

先看 `client/components/ui/` 里有没有你要的基础组件。没有就用 shadcn CLI 加一个：

```bash
pnpm exec shadcn add card
pnpm exec shadcn add dialog table badge
```

命令会把组件写进 `client/components/ui/`，这也是 `components.json` 里配好的位置。不要手写一个 shadcn 已经有的 button、dialog 或 select，也不要从别的项目复制一份过来。

加之前想先看看它提供什么：

```bash
pnpm exec shadcn view card                # 它会写进来的源码
pnpm exec shadcn docs card                # 文档和示例链接
pnpm exec shadcn search @shadcn -q dialog # 按关键词找
```

`search` 的第一个参数是 registry 名称，关键词用 `-q` 传，不能直接写组件名。

## 往上组合

`client/components/ui/` 放基础组件，你自己的组件建在它们上面，放在 `client/components/`：

```tsx
// client/components/order-summary.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function OrderSummary({ order }: OrderSummaryProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.reference}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground'>...</CardContent>
    </Card>
  );
}
```

`@/` 指向 `client/`。不要重新实现基础组件的行为——焦点管理、键盘操作和 ARIA 属性在 shadcn 组件里已经是对的，手写很容易写坏。

## 用主题变量，不要写死颜色

| 该用                                       | 不要用                        |
| ------------------------------------------ | ----------------------------- |
| `bg-background`、`bg-card`、`bg-muted`     | `bg-white`、`bg-gray-50`      |
| `text-foreground`、`text-muted-foreground` | `text-black`、`text-gray-600` |
| `border-border`、`border-input`            | `border-gray-200`             |
| `bg-primary`、`text-primary-foreground`    | `bg-blue-600`、`text-white`   |
| `bg-destructive`、`text-destructive`       | `bg-red-500`                  |

变量定义在 `client/theme/themes/*.css` 里，每套主题各定义一份。写死的颜色在你当时看的那套主题下没问题，换一套主题就坏了——这是这套代码里最常见的样式问题。完整的变量清单见[主题变量](../reference/theme-tokens)。

字体和尺寸也走同一套约定。正文用 `font-sans text-base`，语义化的 h1–h6 用 `font-heading`，code、pre、kbd、samp 用 `font-mono`——标题如果渲染成了别的元素，需要自己补 `font-heading`。间距、尺寸和圆角用 `text-sm`、`p-4`、`gap-2`、`h-8`、`rounded-lg`、`shadow-md` 这些标准值，不要写成等价的任意值。

确实需要固定尺寸的地方要保留，比如图片尺寸、视口限制、圆形图标。但要确认这些固定值、显式行高和阴影颜色没有覆盖掉主题想要的效果。

## 深色模式

两套主题用的是同一组变量，所以用对变量，深色模式就已经能正常工作了。`client/theme/` 里有主题 provider 和「浅色 / 深色 / 跟随系统」的切换入口。

改完要两套主题都看一下。`dark:` 变体只留给变量表达不了的情况——如果你经常需要它，通常说明某处混进了一个写死的颜色。

:::tip 提示

想调整整套外观，改 `client/theme/themes/*.css` 里的变量，不要逐页改样式。新增或修改主题的完整做法见[主题](../capabilities/theme)。

:::

## 图标

图标库是 `lucide-react`。尺寸用 `size-4` 这一档刻度，不要写固定像素，这样图标会跟着旁边的文字缩放。

## 加载、空和错误状态

每个要取数据的界面都需要这三种状态。`client/components/loading.tsx` 是共享的加载指示器。

加载反馈要放在正在加载的那块界面里面。给对话框内容渲染一个页面级 spinner，它会出现在对话框背后，而不是对话框里。

## 一致性是整个应用的事

**应用看起来要像一个产品。** 动手写一个组件之前，先看附近页面是怎么处理同样的问题的：间距用了几档、标题多大、用卡片还是普通区块、操作按钮放在哪。照着来。

**如果确实需要换个样子，就整体一起换。** 改 `client/theme/themes/*.css` 里的变量，或者改每个页面都在用的那个共享组件，让整个应用一起动。

**不要只给自己这一页换一套。** 单独一套间距、单独一种按钮样式、单独一份配色，都是缺陷。如果你认为应用的样式该变，说出来并全局改掉，不要给某一页开小灶。

## Tailwind 扫描范围

`tailwind.config.mjs` 会扫描应用的 client 源码，以及已安装的 `@nocobase` 包里的 client 目录。在 `client/` 下新增的组件会自动被扫到，不需要往配置里登记。

## 改完怎么验证

- 浅色和深色两套主题都显示正常。
- 页面的间距、字体和组件跟旁边的页面是一套。
- 普通颜色、字体、间距、圆角和阴影都由主题变量控制，有意保留的固定值说得清原因。
- 改动过的字体、字号、间距、阴影在中英文长文案、窄屏和弹层里都正常，键盘焦点仍然可见。
- 加载、空和错误状态都能渲染出来。

## 相关链接

- [主题变量](../reference/theme-tokens) — 颜色、字体、字号、间距、圆角和阴影的完整清单。
- [页面和菜单](./pages-and-routes) — 页面路由、菜单和访问控制怎么声明。
- [多语言](./i18n) — 界面上的文字怎么走翻译。
- [主题](../capabilities/theme) — 新增、修改和删除主题预设。
