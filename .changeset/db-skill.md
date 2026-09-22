---
'@nocobase/db': minor
---

Publish a `nocobase-db` Skill so an application's agents get the database rules with the package.

The package's documentation is not published — `files` carried `dist` alone — so an application that installed `@nocobase/db` had no guidance from it, and what existed lived in the application template as a second-hand copy that covered `QueryAdapter` and not Repository. The Skill ships under `skills/` and `nocobase skills sync` copies it into `.agents/skills/` of every application that depends on the package, alongside the plugin Skills already synchronized there.

It is organized as the six areas an application meets: connection and dialect configuration, migrations and seeds, the Collection Builder, Repository and Query, transactions, and Collections. It records what the type declarations cannot — which layer a task belongs to, the reverse criterion for reaching past `query` in a migration or seed, that `database/<connection>/collections/` is derived output for a managed connection but committed metadata for an external one, and the API shapes that do not exist and are otherwise guessed.
