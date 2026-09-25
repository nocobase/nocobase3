---
'@nocobase/ai-employee': minor
'@nocobase/app-plugin-ai-employee': minor
---

Keep LLM services, provider model lists and an employee's model limits consistent

- **`overrideEnabledModels`.** A configured LLM service kept the `enabledModels` stored in the database once it existed, so a model list in `config.yml` took effect only when the service was first created, and a service created without one stayed at zero models whatever was added later. A service that sets `overrideEnabledModels: true` has its configured list reapplied on every load; edits made in AI settings are then overwritten. It governs the list alone: a service an administrator disabled stays disabled even when its entry says `enabled: true`. It defaults to `false`.
- **What `enabledModels` constrains.** It scopes the model selector, `ai:listAllEnabledModels` and the model `resolveModel()` falls back to; a caller that names a model is not checked against it. The documentation now says so, and `ModelService` loses `requireModel()`, an unreachable check that suggested otherwise.
- **An employee's own models.** For an employee with its own model settings, the chat offers only the models it lists that are currently enabled, in its order, opens on the first, and sends the one it shows; the server runs no other. When none of them is enabled, the chat offers no model and cannot send, and the server rejects the run with a `CONFIGURATION_ERROR` rather than falling back to another model. Installed copies of the `nocobase-ai` Registry item get the chat half by updating.
- **Breaking: provider model lists.** `LLMProviderMeta.models` is typed for embedding model suggestions alone, and `ai:listModels` answers only `model=EMBEDDING`. Chat models are listed from each provider's own API through `ai:listProviderModels`, and the hard-coded chat model lists nothing read are removed, as is the Tongyi provider, which was commented out and exported nothing.
