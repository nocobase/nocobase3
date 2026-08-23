# @nocobase/app-client

Shared browser runtime for NocoBase applications built with React, Refine,
React Router, and shadcn.

For now, this package only owns the stable application root:

- React Router and Refine setup;
- application-level provider composition;
- client plugin bootstrap and route contribution contracts;
- the smallest shared shadcn UI primitives.

Application routes, pages, authentication wiring, and product-specific layout
stay in the application package, such as `app-template-default/client`.
Plugin discovery and loading, Registry discovery, ACL UI, and the complete
application shell stay in the application package until those boundaries are
shared by more than one application.

Client plugins can contribute authenticated application routes during
bootstrap. Route pages use a second dynamic import so their code is only loaded
when the URL is rendered:

```ts
const bootstrap: AppClientPluginBootstrap = ({ routes }) => {
  routes.add({
    name: 'index',
    path: '/example',
    componentLoader: () => import('./pages/example'),
  });
};
```

The application owns route placement, authentication, loading, and error UI.
Registration closes when bootstrap completes; plugins cannot mutate the route
table after the application starts.
