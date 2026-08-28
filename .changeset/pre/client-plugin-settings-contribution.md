---
'@nocobase/app-client': minor
'@nocobase/app-plugin-authorization': minor
'@nocobase/app-template-default': minor
---

Add `settings` to `defineClientPlugin`, a fourth contribution type alongside `bootstrap`, `routes`, and `providers`. A plugin points it at a module that default-exports an array of setting definitions, or a function of the plugin options returning one, and each entry becomes a page in the application's settings centre.

An entry is either a page — `id`, `title`, an optional `icon` and `access` rule, and a `pageLoader` — or a group that carries an icon and title once for a set of pages. Ids are single URL segments and nesting comes from the tree, so a page under a group is served at `/settings/<group>/<page>`, and a plugin contributing one page declares it without a group and gets `/settings/<id>`. Groups nest one level. Settings and routes share one path space, so a route and a page that would mount at the same address fail resolution with both identities named.

The default template renders the settings centre, reusing the application shell's chrome — brand, sidebar collapse, theme, and user menu — with `Back to app` where the workspace label sits and no gear pointing at itself. The left rail collapses by group the way the product sidebar does. A page whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either, and a group whose pages are all denied disappears with them. A setting whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either. Authorization's four administration pages now arrive this way, at the URLs they already had, and no longer appear in the product sidebar.

`client:inspect` gains `--type settings`, and `pnpm plugin:create` scaffolds a `client/settings.ts` entry.
