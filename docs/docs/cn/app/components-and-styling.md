---
title: '界面和样式'
description: '使用 shadcn/ui 组件和主题变量编写可复用、可适配浅色与深色主题的页面。'
keywords: 'NocoBase,组件,样式,shadcn,主题变量,深色模式,图标'
---

# 界面和样式

NocoBase 应用使用 shadcn/ui 组件和 Tailwind CSS 编写界面。基础组件放在 `client/components/ui/`，业务组件放在 `client/components/`，页面放在 `client/pages/`。

普通界面样式使用主题变量。这样同一套组件可以适配浅色主题、深色主题和其他主题预设。

## 使用 shadcn/ui 组件

先检查 `client/components/ui/` 中是否已有需要的组件。如果没有，在应用根目录运行 shadcn CLI：

```bash
pnpm exec shadcn add card
pnpm exec shadcn add dialog table badge
```

CLI 会把组件源码写入 `client/components/ui/`。模板的 `components.json` 已将 `ui` 别名配置为 `@/components/ui`，因此可以使用 `@/components/ui/<component>` 导入组件。

添加组件前，可以先查看源码、文档或 registry 中的其他组件：

```bash
pnpm exec shadcn view card
pnpm exec shadcn docs card
pnpm exec shadcn search @shadcn -q dialog
```

`search` 的第一个参数是 registry 名称，搜索关键词通过 `-q` 传入。

已有 shadcn/ui 组件时，直接使用它的实现，不要重新手写同名组件或从其他项目复制一份。焦点管理、键盘操作和 ARIA 属性通常已经在基础组件中处理好。

## 组合业务组件

`client/components/ui/` 只放基础组件。把多个基础组件组合成业务组件时，放在 `client/components/`：

```tsx
// client/components/order-summary.tsx
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Order {
  readonly reference: string;
}

interface OrderSummaryProps {
  readonly order: Order;
}

export function OrderSummary({ order }: OrderSummaryProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.reference}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground'>
        {t('orders.summary')}
      </CardContent>
    </Card>
  );
}
```

`@/` 指向应用的 `client/` 目录。业务组件只负责自己的界面和行为，基础组件的通用交互继续由 shadcn/ui 组件提供。

## 使用主题变量

颜色、字体、字号、间距、圆角和阴影优先使用语义化的 Tailwind class：

| 推荐使用                                   | 避免使用                      |
| ------------------------------------------ | ----------------------------- |
| `bg-background`、`bg-card`、`bg-muted`     | `bg-white`、`bg-gray-50`      |
| `text-foreground`、`text-muted-foreground` | `text-black`、`text-gray-600` |
| `border-border`、`border-input`            | `border-gray-200`             |
| `bg-primary`、`text-primary-foreground`    | `bg-blue-600`、`text-white`   |
| `bg-destructive`、`text-destructive`       | `bg-red-500`                  |

这些 class 会引用应用主题中的 CSS 变量。例如，`bg-card` 在不同主题下会使用各自的 `--card` 值，组件不需要为深色模式重复写一套颜色。

```tsx
// client/components/order-form.tsx
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OrderForm(): ReactElement {
  const { t } = useTranslation();

  return (
    <form className='space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground'>
      <h2 className='font-heading text-lg'>{t('orders.new')}</h2>
      <div className='space-y-2'>
        <Label htmlFor='reference'>{t('orders.reference')}</Label>
        <Input id='reference' placeholder='ORD-0001' />
      </div>
      <div className='flex gap-2'>
        <Button type='submit'>{t('common.save')}</Button>
        <Button type='button' variant='secondary'>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
```

字体使用 `font-sans`、`font-heading` 和 `font-mono`：

- 正文使用 `font-sans text-base`
- 标题使用语义化的 `h1` 到 `h6`，或显式添加 `font-heading`
- `code`、`pre`、`kbd` 和 `samp` 使用 `font-mono`

间距、尺寸和圆角优先使用标准刻度，比如 `p-4`、`gap-2`、`h-8` 和 `rounded-lg`。图片尺寸、视口限制和圆形图标等确实需要固定值时，可以保留固定值。

不要用 `dark:` 为普通颜色单独补一套样式。只在主题变量无法表达需求时使用它；经常需要使用 `dark:` 通常说明样式中混入了硬编码颜色。

主题预设的变量定义在 `client/theme/themes/*.css`，修改整套外观时应该调整主题变量，而不是逐个页面覆盖样式。完整的主题配置方式见[主题](../capabilities/theme)，变量清单见[主题变量](../reference/theme-tokens)。

## 使用图标

应用使用 `lucide-react` 图标。图标尺寸使用 Tailwind 的 `size-*` 刻度，使图标和旁边的文字保持一致：

```tsx
import { Settings } from 'lucide-react';
import type { ReactElement } from 'react';

export function SettingsIcon(): ReactElement {
  return <Settings className='size-4' aria-hidden='true' />;
}
```

正文旁的图标通常使用 `size-4`，需要更醒目时使用 `size-5`。只有图片、图表等有明确尺寸要求的内容才使用固定尺寸。

## 处理加载、空和错误状态

需要请求数据的界面，通常都要处理加载中、无数据和请求失败三种状态。应用提供了共享的 `Loading` 组件：

```tsx
// client/pages/orders.tsx
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';

interface Order {
  readonly id: string;
  readonly reference: string;
}

interface OrdersResponse {
  readonly data: Order[];
}

export default function OrdersPage(): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .request<OrdersResponse>({ path: 'orders' })
      .then((response) => setOrders(response.data))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : t('orders.loadFailed'),
        );
      })
      .finally(() => setIsLoading(false));
  }, [api, t]);

  if (isLoading) {
    return <Loading label={t('orders.loading')} />;
  }

  if (error) {
    return <p className='p-6 text-sm text-destructive'>{error}</p>;
  }

  if (orders.length === 0) {
    return (
      <p className='p-6 text-sm text-muted-foreground'>{t('orders.empty')}</p>
    );
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

`api.request({ path: 'orders' })` 假设应用已经提供了对应的服务端接口。加载反馈要放在正在加载的界面区域内；如果内容位于对话框或抽屉中，就在对话框或抽屉内部显示加载状态。

## 文字和多语言

页面中的用户可见文字使用翻译 key，并将对应翻译添加到 `client/locales/`。具体用法见[多语言](./i18n)。

## 相关链接

- [页面和菜单](./pages-and-routes) — 声明页面路由、菜单和访问控制
- [多语言](./i18n) — 为界面文案添加翻译
- [主题变量](../reference/theme-tokens) — 查看颜色、字体、字号、间距、圆角和阴影
- [主题](../capabilities/theme) — 新增和修改主题预设
