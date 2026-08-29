# File Plugin Development Rules

- Keep this plugin minimal and focused on standard file records, storage access, reusable routes, and client UI.
- Resolve host-owned capabilities from the application's existing `ServiceContainer` through the tokens exported by their owning packages. Never create another dependency injection container.
- Pass the resolved database, Drive manager, base path, and token secret to `createFileRoute`; use a custom `FileStore` only for nonstandard schemas. Never open a second database connection or Drive manager.
- Registry source is application-owned UI only. It must not contain server security, token, Drive, or database logic.
- File tables store stable metadata only. Never persist final access URLs or tokens.
- Do not implement or call the legacy `storages:*` protocol.
- Tests belong under the package-root `tests/` directory.
- Run `pnpm --filter @nocobase/app-plugin-file lint`, `format:check`, `typecheck`, `test`, and `build` before committing.
- Public package documentation, code comments, identifiers, logs, and errors are written in English.
