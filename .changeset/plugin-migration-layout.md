---
'@nocobase/create-plugin': patch
---

Tell a generated plugin how its migrations differ from an application's.

The template explained `baseDir` and the compiled manifests but never the layout the declaration points at, so the application shape was the only one an agent had seen. A plugin declares one `database/migrations` and `database/seeds` with no connection segment, because it contributes to the installing application's default connection alone.

Two consequences only appear in someone else's application, which is why they are worth stating here. Migration names must be unique across every source the application loads, so a collision with another plugin or with the application itself fails the whole run rather than one package's tasks; and ordering is by name across all sources, so a plugin's migrations interleave with the application's instead of applying as a block.
