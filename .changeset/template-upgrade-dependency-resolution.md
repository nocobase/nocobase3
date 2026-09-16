---
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
"@nocobase/app-template-hub": patch
---

Deduplicate dependencies during template upgrades and resolve stale dependency type conflicts. Replace outdated migration documents with upgrade Skill guidance based on template differences and application state, preserving migration history and user-authored operational notes. Check actual plugin usage before removing template-provided dependencies and registrations so upgrades preserve capabilities the application still uses.
