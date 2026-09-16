---
'@nocobase/app-plugin-ai-employee': patch
---

Persist AI employee collection field metadata so Oracle returns booleans and integers with their logical types. Let the database query layer encode and decode JSON once, and use a round-trippable name for the default LLM service field. This changes initialization definitions and requires recreating development databases initialized with the previous definitions.
