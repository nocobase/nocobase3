---
'@nocobase/app-plugin-ai-employee': patch
---

Let a configured LLM service reapply its model list, when it asks to

`ai.llmServices` synchronizes with `preserveUserState: true`, so a service that already exists keeps the `enabledModels` and `enabled` held in the database. That is right for the model list most of the time: it is curated in AI settings, and a configuration reload must not discard it.

It also means the list in `config.yml` takes effect exactly once, when the service row is first created, and never again. Correcting a model id in `config.yml` afterwards does nothing and reports nothing. A service first created without `enabledModels` is worse: the list normalizes to an empty provider-mode list, an empty list makes `toEnabledLLMService` return `null`, and the service is absent from `ai:listAllEnabledModels` — so the application has a configured service and no usable model, and editing `config.yml` cannot fix it.

`overrideEnabledModels` on a service opts that one service into having its configured list reapplied on every load. It is optional and defaults to `false`, so nothing changes for an application that does not set it. Enabling it hands the list to `config.yml` and means edits made in the UI are overwritten on the next reload, which is the trade being made deliberately rather than discovered.

The switch governs the model list alone. Whether a service is enabled stays where an administrator left it, because turning a service off is a separate decision from choosing which models it offers.
