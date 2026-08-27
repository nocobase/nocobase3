# Files Plugin Development Rules

- Keep this plugin minimal and focused on standard file records, storage access, reusable routes, and client UI.
- Trusted server plugins may receive the host's existing `AppDeps.database`; do not add `AppServices.files`, a mutable service registry, or another dependency injection container.
- Create `FilesService` locally from the existing plugin context. Never open a second database connection or Drive manager.
- Registry source is application-owned UI only. It must not contain server security, token, Drive, or database logic.
- File tables store stable metadata only. Never persist final access URLs or tokens.
- Do not implement or call the legacy `storages:*` protocol.
- Tests belong under the package-root `tests/` directory.
- Run `pnpm --filter @nocobase/app-plugin-files lint`, `format:check`, `typecheck`, `test`, and `build` before committing.
- Public package documentation, code comments, identifiers, logs, and errors are written in English.
