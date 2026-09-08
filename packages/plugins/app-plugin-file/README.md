# File App Plugin

`@nocobase/app-plugin-file` provides file repositories, multipart uploads, stable content URLs, and editable Registry components. Server services reuse the application's Database and Drive managers; Client services reuse its API Client.

- Register `./server` and the `./client` factory to provide the two Repository managers.
- Declare business collections and expose their operations with `defineFileRepositoryApiRoutes()`.
- Install the `component-ui` Registry item for editable upload, list, thumbnail, and preview UI.
- Use [app-file-example](../../examples/app-file-example/README.md) for the runnable attachments example.

Start with the [Agent integration Skill](skills/nocobase-app-plugin-file/SKILL.md). The [manual](docs/README.md) explains the API and current limitations. The plugin itself owns no collection, migration, page, or locale.

This replaces the old File backend and client protocol. `createFileRoute`, `FilesClient`, access-token routes, inventory settings, and runtime component exports have been removed. Installed Registry copies need to adopt `ClientFileRepository` and the new `FileRecord` fields. Existing business tables are not migrated automatically. The separate File Repository package is removed; its exported manager and route-helper names remain available from this package.
