---
'@nocobase/app-template-examples': patch
---

Stop declaring the MySQL, Oracle and PostgreSQL drivers. They date from when a template registered its drivers explicitly in `server/config/database.ts`; drivers load automatically now, and none of the Examples template's connections uses them — all three are SQLite.

With four drivers installed, `pnpm config:init` cannot tell which one a new application means to use, and without a terminal to ask on it refuses rather than guess. The step every generated application is told to run next therefore failed for Examples in any scripted or agent-driven setup, while Default and Hub, which declare only SQLite, succeeded. Each of the unused drivers was also installed into every deployment. An application that wants one of them adds it with `pnpm add` and names it with `pnpm config:init --dialect`.
