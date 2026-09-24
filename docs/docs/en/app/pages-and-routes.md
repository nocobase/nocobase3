---
title: 'Pages and navigation'
description: 'Add a page, put it in the menu, require sign-in.'
---

# Pages and navigation

:::warning Being written
This page is being written.
:::

Add a page, put it in the menu, require sign-in.

## This page will cover

- Declare the route and write the page component
- Register the navigation entry — a route alone does not put the page in the menu
- `auth` requires sign-in for navigation; note it is not server-side security
- How to add settings pages and development-only pages

## Every page declares `authz`

Every page route declares `authz`: either `{ resource: { type: 'page', id }, action: 'access' }`, which lists the page in the permission workspace and shows it only to users granted it, or `'skip'`, which checks nothing beyond sign-in and parent routes (typical for child pages and guest pages). Nothing is inferred from the route name, and a page without `authz` is rejected at registration. See [Route types](./reference/routes) for settings and development pages.

```ts
defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'Orders' },
    authz: { resource: { type: 'page', id: 'orders' }, action: 'access' },
    componentLoader: () => import('./pages/orders/index.js'),
    children: [
      {
        name: 'order-detail',
        path: ':orderId',
        authz: 'skip',
        componentLoader: () => import('./pages/orders/detail.js'),
      },
    ],
  },
  {
    name: 'login-help',
    path: '/login-help',
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/login-help.js'),
  },
]);
```
