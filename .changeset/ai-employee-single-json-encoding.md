---
'@nocobase/app-plugin-ai-employee': patch
---

Stop serializing JSON fields a second time on top of the Query layer.

The plugin serialized its own JSON fields before handing them to the Query layer, which serializes them again, so every value it wrote reached the column as a JSON string holding JSON text rather than as the JSON value itself. Reading worked only because the plugin parsed the extra layer back off. The stored data was a string as far as the database was concerned, which made SQL-level JSON queries and indexes useless on it and left the plugin dependent on a decoder that has since been corrected.

A migration removes the extra layer from existing rows. Values that took a column default were written by the database and never carried it.
