---
name: nocobase-app-development
description: Build features in a NocoBase 3 application — pages, routes, shadcn/ui components, HTTP endpoints, database migrations and queries, services, background jobs, translations, and tests. Use when adding or changing any feature in an application generated from the NocoBase default template. Do not use for developing a published NocoBase 3 plugin package.
metadata:
  short-description: Develop features in a NocoBase 3 application
---

# NocoBase 3 application development

Use this Skill when building a feature in this application: a page, an endpoint, a table, a service, or the tests covering them.

Do not use it to develop a published plugin package. Plugin development has its own protocol and lives in a separate repository.

## Before you start

Read the application's `AGENTS.md` first for the rules that apply everywhere. This Skill's references are the detail behind it.

Confirm you are in an application and not a plugin package. An application has:

```text
client/runtime.ts
server/runtime.ts
config.example.yml
```

If instead you find `client/plugin.ts`, `server/plugin.ts`, or a `defineServerPlugin()` declaration, you are in a plugin package and this Skill does not apply.

## The one rule that decides most tasks

Build the feature in the application. Do not run a plugin generator, create a `packages/plugins/` directory, or write a `defineServerPlugin()` declaration for this application's own feature. Create a plugin only when the user explicitly asks for an independently published, reusable package.

## Check the installed plugins first

This application ships with plugins that already implement whole categories of requirement, each publishing its own Skill under `.agents/skills/` (run `pnpm plugin:skills:sync` if that directory is missing or stale):

| The requirement sounds like                              | Read the Skill for                    |
| -------------------------------------------------------- | ------------------------------------- |
| Approvals, multi-step processes, "when X happens then Y" | `@nocobase/app-plugin-workflow`       |
| Email, IM, or in-app messages                            | `@nocobase/app-plugin-notification`   |
| Roles, permissions, per-user or per-record access        | `@nocobase/app-plugin-authorization`  |
| Sign-in, registration, sessions                          | `@nocobase/app-plugin-authentication` |
| Uploads, attachments, file fields                        | `@nocobase/app-plugin-file`           |
| Translated text and language switching                   | `@nocobase/app-plugin-i18n`           |

Read the relevant Skill before writing the feature. Implementing a permission system, a notification sender, or a scheduler by hand when a registered plugin provides one is the most expensive mistake available here.

## Choose your reference

Read the page for the task in front of you. Do not read all of them.

| Task                                                                             | Read                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Add a page, choose an auth mode, add navigation, customize a plugin page         | [client pages and routes](references/client-pages-and-routes.md) |
| Add or compose UI, add a shadcn primitive, style consistently, support dark mode | [components and styling](references/components-and-styling.md)   |
| Add an API endpoint, a webhook, or a callback; authenticate and authorize it     | [server routes](references/server-routes.md)                     |
| Query or write data, resolve the database, work with transactions                | [database and data access](references/database-and-data.md)      |
| Create a table, alter a column, add an index, write required initial data        | [migrations and seeds](references/migrations.md)                 |
| Make text translatable, add a locale, reword a plugin's string                   | [internationalization](references/i18n.md)                       |
| Add a reusable service, share it across routes, run background or scheduled work | [services and jobs](references/services-and-jobs.md)             |
| Write tests, choose a test layer, verify before finishing                        | [testing and verification](references/testing.md)                |

A feature with a page and an API usually needs four: migrations, server routes, client pages and routes, and i18n.

## Where to work

Business code belongs in a small, stable set of places:

```text
client/routes.ts, client/pages/, client/components/, client/locales/,
client/service-provider.ts, server/routes/, server/providers/,
database/migrations/, database/seeds/, tests/
```

Everything else — `client/routing/`, `client/shell/`, `client/layouts/`, `client/theme/`, the server entry points, the build scripts, the tsconfigs — is the framework structure the template provides and evolves. Prefer the mechanism the system already offers: most work that looks like it needs a change there does not.

When the built-in mechanism genuinely cannot express the requirement, changing that structure is a legitimate answer. Comment what you changed and why the built-in path did not fit, and update `AGENTS.md` and this Skill in the same change so they still describe the real application.

## Ownership

```text
You own       pages, components, endpoints, tables, migrations, services,
              translations, tests, navigation, theme, business logic

Plugins own   their routes, components, tokens, services, internal tables,
              and their skills/ source

Generated     .agents/skills/ — synchronized copies, gitignored, replaced
              wholesale on the next sync; never edit

Config        config.yml — gitignored, holds secrets; document options in
              config.example.yml instead
```

Reach a plugin's capability only through its documented package exports. Never import a plugin's internal source path or write to its tables directly.

## Non-negotiables

These cause real damage and appear in every reference:

- **Every server route owns its own authentication and authorization.** Mounting under `/api` authenticates nothing.
- **A migration is immutable history and self-contained.** Never import an evolving definition into one. Never edit one whose branch is merged.
- **Every user-visible string goes through a translation key.**
- **Visual consistency is application-wide.** Restyling only your part is a defect. Change the design tokens if a change is needed.
- **Route paths never include the deployment base path.** The runtime restores it.
- **A route does not create a sidebar entry.** That needs a Refine resource in `client/service-provider.ts`.
- **Reach for the built-in mechanism first.** Changing framework structure is allowed when nothing else fits — comment it and update the docs.
- **Tests live in `tests/` or `e2e/`,** never beside the source.

## Finishing

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Verify observable behavior, not just that the commands passed. [Testing and verification](references/testing.md) lists what to check for each kind of change.
