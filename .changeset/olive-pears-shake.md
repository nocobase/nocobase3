---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Remove the hard-coded chat model lists from the LLM provider metadata. Nothing read them: chat models are listed live from each provider's own API through `ai:listProviderModels`, while `LLMProviderMeta.models` only ever fed the embedding model picker (`ai:listModels?model=EMBEDDING`). The stale lists were a maintenance burden and a misleading reference. `models` is now typed for embedding suggestions alone, and `ai:listModels` answers only `model=EMBEDDING`. The fully commented-out Tongyi provider is removed along with its re-export, which exported nothing.
