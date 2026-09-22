---
'@nocobase/app-plugin-ai-employee': patch
---

Remove `ModelService.requireModel()`. It validated a model against the service's `enabledModels` and threw `Model is not enabled`, but no route or service ever called it — only its own test did. Keeping an unreachable check around invites the belief that the list is enforced somewhere, which it is not.
