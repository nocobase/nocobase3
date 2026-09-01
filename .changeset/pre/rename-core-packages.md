---
'@nocobase/db': major
'@nocobase/i18n': major
'@nocobase/app-server': major
'@nocobase/snowflake': major
---

Rename four packages, dropping the qualifiers they only carried to avoid names the v2 line had taken.

| Before                     | After                  |
| -------------------------- | ---------------------- |
| `@nocobase/app-database`   | `@nocobase/db`         |
| `@nocobase/app-i18n`       | `@nocobase/i18n`       |
| `@nocobase/app-server-kit` | `@nocobase/app-server` |
| `@nocobase/id-generator`   | `@nocobase/snowflake`  |

There is no compatibility shim: the old names receive no further releases, and a dependency on one has to be repointed by hand. Each package keeps its version history, which is why the changelogs say which name the earlier releases went out under.

`@nocobase/app-server` reclaims a name the v2 line abandoned at `0.11.1-alpha.5`, so it starts at `1.0.0-beta.0` rather than continuing its own `0.1.0-beta` line — `0.1.0` sorts below `0.11.1`, and npm would have rejected the publish. The other three take names that were never published.

`@nocobase/snowflake` also now matches what it implements; its only source file was already called `snowflake.ts`.
