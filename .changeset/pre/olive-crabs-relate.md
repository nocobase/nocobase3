---
'@nocobase/create-app': patch
---

Write the full `allowBuilds` list into every generated application rather than only the driver its database needs. `better-sqlite3` is listed even when another database was chosen, so switching an app to sqlite later works instead of failing with an error that names nothing actionable, and `@nocobase/app-portal-sdk` and `esbuild` are listed because the application installs both and pnpm 11 skips their build scripts otherwise.
