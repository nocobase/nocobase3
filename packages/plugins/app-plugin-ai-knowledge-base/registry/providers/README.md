# AI Knowledge Base providers

This item is the application-owned integration layer for `@nocobase/app-plugin-ai-knowledge-base`. Its public entry is `index.ts`, which exports the current browser DTOs, error and pagination normalization, `KnowledgeBaseService`, `KnowledgeBaseServiceProvider`, the default App Portal transport, and stale-safe resource hooks.

It materializes to `client/extensions/nocobase-ai-knowledge-base-providers`. The consuming application may customize transport selection, response adaptation, retry policy, and hook composition. Keep server authorization, field allowlists, storage validation, migrations, queues, and database behavior in the plugin; browser affordances are not authorization.

The plugin must already be installed, registered, enabled, and compatible with the range in `registry.config.json`. Repository materialization does not prepare those prerequisites or install npm dependencies.

The installed copy belongs to the application. When the plugin publishes a newer canonical source, compare the old and new upstream versions and merge changes into the application copy with a three-way merge. Do not overwrite local edits.
