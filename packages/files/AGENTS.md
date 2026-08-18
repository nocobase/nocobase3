# Files Kernel rules

- Read `README.md` and `src/contracts` before changing this package.
- This is a headless kernel with no UI and no legacy compatibility layer.
- Never expose backend-private fields such as storage keys, paths, credentials, or provider state.
- All queries must be workspace-scoped and all external operations must pass through the Authorizer.
- File content is immutable. Do not add folders, tags, or version-product behavior.
- Later Goals use `pnpm --filter @nocobase/files typecheck`, `test`, `build`, and `pack`.
