---
"@nocobase/db": patch
"@nocobase/db-testkit": patch
---

Remove circular development dependencies between the database core, shared testkit, and dialect packages. Move runnable database examples, the playground, and benchmarks to repository development tools.
