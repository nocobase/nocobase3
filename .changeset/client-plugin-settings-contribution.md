---
'@nocobase/app-client': minor
'@nocobase/app-plugin-authorization': minor
'@nocobase/app-template-default': minor
---

Add `settings` to `defineClientPlugin`, a fourth contribution type alongside `bootstrap`, `routes`, and `providers`. A plugin points it at a module that default-exports an array of setting definitions, or a function of the plugin options returning one, and each entry becomes a page in the application's settings centre.

A setting declares `id`, `title`, `group`, an optional `access` rule, and a `pageLoader`. The id is both the identity and the URL, so a setting is served at `/settings/<id>`; slashes namespace a plugin's pages and keep ids from colliding between plugins. Settings and routes share one path space, so a route and a setting that would mount at the same address fail resolution with both identities named.

The default template renders the settings centre: the header gear now opens the application's own `/settings` instead of linking out to the NocoBase server, and the page lists every setting the current user may open, grouped by `group`. A setting whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either. Authorization's four administration pages now arrive this way, at the URLs they already had, and no longer appear in the product sidebar.

`client:inspect` gains `--type settings`, and `pnpm plugin:create` scaffolds a `client/settings.ts` entry.
