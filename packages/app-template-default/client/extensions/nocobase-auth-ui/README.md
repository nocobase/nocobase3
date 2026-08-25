# NocoBase Authentication UI

Application-owned authentication presentation backed by the authentication
plugin. The authentication plugin owns protocol, session state, route identity,
headless actions and internal fallback forms. This Registry item owns the final
forms, branding, layout and page composition, and overrides only the plugin
route component loaders.

The canonical recipe is published by `@nocobase/app-plugin-authentication`.
Once materialized, files under `client/extensions/nocobase-auth-ui` are
application-owned source code and may be edited freely. Upgrades should be
reviewed as a three-way merge; plugin internals must not be copied into the
installed extension.

## Edit map

| Task                                     | File                                  |
| ---------------------------------------- | ------------------------------------- |
| Logo or product name                     | `components/auth-brand.tsx`           |
| Columns, spacing, or shared layout       | `components/auth-layout.tsx`          |
| Marketing copy or artwork                | `components/auth-marketing-panel.tsx` |
| Form fields, validation, and form layout | `forms/*-form.tsx`                    |
| Page title, links, or form composition   | `pages/*-page.tsx`                    |
| Route-to-page component mapping          | `extension.ts`                        |

Use `AuthLink` from the plugin's `client/ui` entry for NocoBase SPA navigation.
The four password forms in `forms/` are application-owned and use the plugin's
stable `client/actions` hooks. They may be changed or replaced with captcha,
social login, organization fields, or application-specific validation. Do not
import plugin-internal fallback forms. Do not add duplicate `/login`, `/register`,
`/forgot-password`, or `/reset-password` routes.
