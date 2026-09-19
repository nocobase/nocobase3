---
'@nocobase/app-plugin-ai-employee': minor
---

Identify `ai.aiKnowledgeBase.vectorDatabases` entries by `key` instead of `name`. This is a breaking change to the application configuration contract: `key` is now required and must be unique within one configuration, and `name` is now optional.

`key` is the stable identifier of a record — the knowledge-base plugin matches existing records by it when synchronizing declarative configuration, and its settings page lists it as the UID. `name` is only a display title, shown as the Title, and falls back to `key` when omitted, so two entries may share the same name.

A configuration written against the previous contract fails to typecheck until each entry's `name` is renamed to `key`. Keep `name` alongside it only when a separate display title is wanted.
