---
title: 'Route types'
description: 'What each of the five route types is for.'
---

# Route types

:::warning Being written
This page is being written.
:::

What each of the five route types is for.

## This page will cover

- Two on the server: root-level callbacks and webhooks, and business endpoints under `/api`
- Three on the client: regular pages, settings pages, development-only pages
- Which path each one mounts under
- Development routes are absent from a production build — but that is a build boundary, not a permission boundary

## `authz` on client routes

`authz` is `'skip'`, `'unrestricted'` or a `{ resource: { type, id }, action }` request that the client checks before loading the page component. Nothing is inferred from the route name. Declare it on the first page of every path: a nested page that omits it inherits the value of its nearest ancestor page, through groups and any number of levels, and a child's own value overrides it. A first page that omits it still registers, with a development warning: a protected App page (`auth: 'required'`) or a settings page defaults to `'unrestricted'`, which only identities with unrestricted access such as root may open, and a `guest` or `optional` App page or a dev page defaults to `'skip'`. `'unrestricted'` may also be declared for a root-only page and is never offered as a grant. `'skip'` skips only this page's check, not sign-in or parent checks. A denied page is hidden from its navigation and its URL does not load the component; server endpoints the page calls still check authorization themselves.

```ts
defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'navigation.orders' },
    authz: { resource: { type: 'page', id: 'orders' }, action: 'access' },
    componentLoader: () => import('./pages/orders.js'),
  },
]);

defineSettingsRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'navigation.orders' },
    authz: { resource: { type: 'settings', id: 'orders' }, action: 'read' },
    componentLoader: () => import('./pages/orders-settings.js'),
  },
]);

defineDevRoutes([
  {
    name: 'inspect',
    path: '/inspect',
    navigation: { title: 'navigation.inspect' },
    authz: 'skip',
    componentLoader: () => import('./pages/inspect.js'),
  },
]);
```
