---
'@nocobase/app-plugin-ai-employee': patch
---

Keep a disabled LLM service disabled when `overrideEnabledModels` reapplies its models

`overrideEnabledModels: true` is meant to reapply a service's model list and nothing else. It also took `enabled` from `config.yml` whenever the file set it, so a service an administrator had turned off came back on at the next load — and the template's example sets `enabled: true`. The switch now leaves `enabled` with the database, as its documentation already said.
