# Database migrations

The migration history creates the plugin schema, replaces legacy storage IDs with disk names, and then irreversibly replaces the legacy vector-store configuration schema with inline LOCAL/READONLY fields on `aiKnowledgeBase`. The final schema contains five plugin-owned collections. The existing `llmServices` collection remains owned by `@nocobase/ai-employee`.
