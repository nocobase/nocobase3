---
'@nocobase/app-client': minor
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
---

Add a route `title` and derive breadcrumbs from it.

A client route may now declare `title`, which names it as a destination independently of whether it appears in a
menu. It falls back to the menu title, so a route that already declares `navigation` needs no second declaration,
and unlike `navigation` it is allowed on a parameterised path — which is the only way a page such as `/orders/:id`
could name itself before.

Breadcrumbs show the trail of destinations rather than the URL segments. A route joins the trail by having a title,
so tabs, overlays and layers that exist only to share a layout are skipped; a level links to the resolved path
rather than to its route pattern, and a menu group with no page behind it reads as plain text instead of a dead
link. Nothing renders until the page actually sits under a parent, since a single level would only repeat the
heading directly below it.

A title names the kind of page rather than the record it is showing: `/orders/:orderId` is called "Order detail",
not "Order #42". The trail states where in the structure the user is, and the page's own heading already identifies
the record — so every level is known before the page loads anything, and the trail never changes while it does.

A page places `<Breadcrumbs />` itself and keeps its own container and spacing. The trail begins at the first named
level on the way to the page, with no root crumb of its own.

`RouteChildPage` is a third way a child route can present itself, beside `RouteDialog` and `RouteDrawer`: a layer
covering the content area rather than floating in the middle or at the side. It is deliberately not modal — the user
is still on a page of the application and has to reach the sidebar — so the breadcrumb above it, not a close button,
is what dismisses it. Because every child route is now a layer, a parent renders its content and places its outlet
without knowing what kind of child follows, and the page beneath keeps its DOM while the layer is open.

The layout follows from that: the application shell is a fixed frame and the content area is what scrolls, so a
layer covers exactly the content area.

The examples application demonstrates both kinds under its route overlays page: the dialog and drawer leave the
trail untouched, while the nested pages beside them each add a level.

Also adds the `PageHeader` component for a page title, description and action slots.
