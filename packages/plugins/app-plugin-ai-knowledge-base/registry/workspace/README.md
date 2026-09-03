# AI Knowledge Base workspace

This item provides the application-owned page composition for knowledge-base management, documents, uploads, retrieval, document segments, nested segment editing, URL restoration, notifications, conflict recovery, and partial-save recovery. Import pages and route helpers through `index.ts` and compose them in the consuming application's routes.

It materializes to `client/extensions/nocobase-ai-knowledge-base-workspace`. Install the `providers` and `components` items at their independent targets first; remote installation resolves both named Registry dependencies recursively. The NocoBase AI Knowledge Base plugin must also be installed, registered, enabled, and version-compatible. Installation does not register routes, enable plugins, install repository-materialized dependencies, or overwrite existing source.

Applications may modify route composition, layout, branding, notifications, and page workflow. Keep server API enforcement, storage credentials, file validation, migrations, queues, vectorization, and database logic in the plugin. The workspace deliberately consumes the current `disk` storage contract and current management actions; do not restore the obsolete `storageId` protocol.

The installed copy belongs to the application. Upgrade by comparing old and new canonical source and applying a three-way merge that preserves application changes. Re-run application lint, typecheck, tests, build, responsive and accessibility checks after merging.
