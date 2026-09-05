# AI Knowledge Base components

This item provides application-owned controlled UI for knowledge-base directories, document tables, uploads, retrieval results, segments, and segment editing. Import its stable surface through `index.ts`. Locale loaders are exported from `locales/index.ts`.

It materializes to `client/extensions/nocobase-ai-knowledge-base-components` and imports the separately installed providers item from `@/extensions/nocobase-ai-knowledge-base-providers`. UI primitives resolve to the consuming application's `@/components/ui/*`, and utility classes use `@/lib/utils`. Remote installation resolves the declared Registry dependencies; repository materialization expects them to be prepared first.

Applications may change layout, styling, copy, and controlled composition. Do not move server authorization, upload validation, queue processing, storage credentials, database logic, or management security into this item. Disabled buttons and access-aware presentation remain browser affordances, not an authorization boundary.

The installed copy belongs to the application and upgrades use a three-way merge. Preserve application changes while reviewing upstream API, locale, dependency, accessibility, and behavior changes.
