---
"@nocobase/ai-employee": patch
"@nocobase/app-plugin-ai-employee": patch
---

Add employee skill enable switches backed by an optional `skillSettings.enabledSkills` allowlist. Omitted or null selections retain inherited GENERAL and registered skills, while an empty list disables every skill. Preserve explicit selections across built-in registration and repository reloads, intersect session restrictions, and reject unavailable skill content and persisted tool activations. Existing skill and tool settings remain compatible without a database migration.
