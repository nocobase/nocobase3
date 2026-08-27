# @nocobase/app-plugin-files

Minimal full-stack file capabilities for NocoBase applications.

The package provides Drive-backed file storage, scoped database stores, reusable
Hono routes, Public and expiring-Token content access, client components, a
plugin-owned `/files-demo` page, and application-owned Registry recipes.

The Registry publishes `component-ui` for directly imported file components
and `page-ui` for an editable Demo route override. The runtime fallback remains
inside the plugin under `client/default-pages` when neither item is installed.

Start with the [quick start](docs/quick-start.md), then use the
[data-model](docs/data-model.md), [Route API](docs/route-api.md), and
[security](docs/security.md) guides for focused integration details. Coding
Agents can use the published `files-development` Skill under `skills/`.
