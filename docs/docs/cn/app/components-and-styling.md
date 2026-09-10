---
title: '界面和样式'
description: '用 shadcn/ui 组件拼界面，用语义化的主题变量写样式，让浅色深色和换主题都自动适配。'
keywords: 'NocoBase,组件,样式,shadcn,主题变量,深色模式,图标'
---

# 界面和样式

界面由 shadcn/ui 的基础组件拼出来，样式统一走语义化的主题变量。变量在每套主题的浅色和深色规则里各定义了一份，所以样式写对了，深色模式和换主题都不用额外处理。

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

`@/` 指向 `client/`。不要重新实现基础组件的行为。焦点管理、键盘操作和 ARIA 属性在 shadcn 组件里已经是对的，手写很容易写坏。

## 如何编写样式

颜色、字体、字号、间距、圆角和阴影都通过主题变量表达，常用的对应关系如下：

| 该用                                       | 不要用                        |
| ------------------------------------------ | ----------------------------- |
| `bg-background`、`bg-card`、`bg-muted`     | `bg-white`、`bg-gray-50`      |
| `text-foreground`、`text-muted-foreground` | `text-black`、`text-gray-600` |
| `border-border`、`border-input`            | `border-gray-200`             |
| `bg-primary`、`text-primary-foreground`    | `bg-blue-600`、`text-white`   |
| `bg-destructive`、`text-destructive`       | `bg-red-500`                  |

用主题变量的直接好处是深色模式自动适配。每套主题都分别定义了浅色和深色两份变量，你写 `bg-card`，深色下取到的就是深色的 `--card`，不需要为深色单独写一套样式。

前提是别写死颜色。下面这个表单区块用到的都是主题变量：

```tsx
// client/components/order-form.tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OrderForm(): ReactElement {
  return (
    <form className='space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm'>
      <h2 className='font-heading text-lg'>新建订单</h2>
      <div className='space-y-2'>
        <Label htmlFor='reference'>订单编号</Label>
        <Input id='reference' placeholder='ORD-0001' />
        <p className='text-sm text-muted-foreground'>编号创建后不能修改。</p>
      </div>
      <div className='flex gap-2'>
        <Button type='submit'>保存</Button>
        <Button type='button' variant='secondary'>
          取消
        </Button>
      </div>
    </form>
  );
}
```

把 `bg-card` 换成 `bg-white`、`text-muted-foreground` 换成 `text-gray-500`，浅色下几乎看不出区别，深色下就是白底浅灰字。这是这套代码里最常见的样式问题。

字体和尺寸也走同一套约定。正文用 `font-sans text-base`，语义化的 h1 到 h6 用 `font-heading`，code、pre、kbd、samp 用 `font-mono`。标题如果渲染成了别的元素，需要自己补 `font-heading`。间距、尺寸和圆角用 `text-sm`、`p-4`、`gap-2`、`h-8`、`rounded-lg`、`shadow-md` 这些标准值，不要写成等价的任意值。

确实需要固定尺寸的地方要保留，比如图片尺寸、视口限制、圆形图标。但要确认这些固定值、显式行高和阴影颜色没有覆盖掉主题想要的效果。

`dark:` 变体只留给变量表达不了的情况。如果你经常需要它，通常说明某处混进了一个写死的颜色。

:::tip 提示

想调整整套外观，改 `client/theme/themes/*.css` 里的变量，不要逐页改样式。新增或修改主题的完整做法见[主题](../capabilities/theme)。

:::

## 图标

图标库是 `lucide-react`。尺寸用 `size-*` 这档刻度，按旁边文字的大小选，不要写固定像素：

```tsx
// 正文旁的图标通常是 size-4，需要更醒目就用 size-5
<Settings className='size-4' aria-hidden='true' />
```

## 加载、空和错误状态

每个要取数据的界面都需要这三种状态。`client/components/loading.tsx` 是共享的加载指示器：

```tsx
// client/pages/orders.tsx
import { apiClientToken, useService } from '@nocobase/app-client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';

interface Order {
  readonly id: string;
  readonly reference: string;
}

export default function OrdersPage(): ReactElement {
  const api = useService(apiClientToken);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .request<{ data: Order[] }>({ path: 'orders' })
      .then((response) => setOrders(response.data))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : '订单加载失败'),
      )
      .finally(() => setIsLoading(false));
  }, [api]);

  if (isLoading) {
    return <Loading label='正在加载订单' />;
  }

  if (error) {
    return <p className='p-6 text-sm text-destructive'>{error}</p>;
  }

  if (orders.length === 0) {
    return <p className='p-6 text-sm text-muted-foreground'>还没有订单。</p>;
  }

  return (
    <ul className='space-y-2 p-6'>
      {orders.map((order) => (
        <li
          key={order.id}
          className='rounded-lg border border-border bg-card p-4 text-card-foreground'
        >
          {order.reference}
        </li>
      ))}
    </ul>
  );
}
```

加载反馈要放在正在加载的那块界面里面。给对话框内容渲染一个页面级 spinner，它会出现在对话框背后，而不是对话框里。

## 相关链接

- [主题变量](../reference/theme-tokens)：颜色、字体、字号、间距、圆角和阴影的完整清单。
- [页面和菜单](./pages-and-routes)：页面路由、菜单和访问控制怎么声明。
- [多语言](./i18n)：界面上的文字怎么走翻译。
- [主题](../capabilities/theme)：新增、修改和删除主题预设。
