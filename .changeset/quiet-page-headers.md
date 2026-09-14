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
link. Nothing renders until the page actually sits under a parent, since a lone `Home` crumb only repeats the
sidebar. A page names itself at runtime through `usePageTitle` once it knows the record it is showing, with the
declared title holding the level until then.

Also adds the `PageHeader` component for a page title, description and action slots. It renders the trail above the
heading by default, so the gap between the two is the same on every page while the page keeps its own container and
width; `breadcrumbs={false}` leaves the placement to the page.
