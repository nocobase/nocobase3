---
'@nocobase/create-app': patch
---

Pin the pnpm version in generated applications. Without it the project runs on whatever pnpm the machine defaults to, and pnpm 10 does not read `allowBuilds` at all, so the database driver installs without compiling its native addon and fails only at the first query.
