---
'@nocobase/db': patch
---

Remove the integration test scripts from `@nocobase/db`.

`test:integration`, `test:integration:<dialect>` and `test:integration:all` only
forwarded to the dialect packages, and the indirection misled more than it
helped: `pnpm --filter @nocobase/db test:integration` read as a full run while
it ran SQLite alone, and `test:integration:all` invited an eight-dialect serial
run that CI already performs on every pull request. Run a suite through the
package that owns it, as CI does:
`pnpm --filter @nocobase/db-<dialect> test:integration`.
