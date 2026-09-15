---
'@nocobase/app-client': minor
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
---

Add a route `breadcrumb` declaration and build breadcrumbs from it.

A client route may declare `breadcrumb`, which works the way `navigation` does: declaring it puts the route in the
trail, leaving it out keeps the route out. A trail therefore shows destinations rather than URL segments — a tab, an
overlay, or a layer that exists only to share a layout declares none and is skipped. Unlike `navigation` it is
allowed on a parameterised path, because it names the kind of page rather than the record it shows: `/orders/:orderId`
is "Order detail", not "Order #42", so every level is known before the page loads anything.

A page places `<Breadcrumbs />` itself and keeps its own container and spacing. A level links to the resolved path, a
menu group with no page behind it reads as plain text rather than a dead link, and nothing renders until the page
actually sits under a parent, since a single level would only repeat the heading below it.

`RouteChildPage` is a third way a child route can present itself, beside `RouteDialog` and `RouteDrawer`: a layer
covering the content area rather than floating in the middle or at the side. It is deliberately not modal — the user
is still on a page of the application and has to reach the sidebar — so the breadcrumb above it dismisses it rather
than a close button, and the page beneath keeps its DOM while the layer is open. The layer marks the siblings it
covers `inert`, so what it hides leaves the tab order and the accessibility tree while the sidebar and header stay
reachable.

The application shell is now a fixed frame with the content area scrolling inside it, which is what lets a layer
cover exactly the content area.

Also adds `PageHeader` for a page title, description and action slots, and `EMPTY_ARRAY` in
`client/lib/constants.ts` — one frozen empty array, so a default parameter or a `??` fallback built from it keeps its
identity between renders instead of invalidating the memo it feeds.
