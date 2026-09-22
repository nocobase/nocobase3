---
'@nocobase/app-plugin-ai-employee': patch
---

Stop `subAgentWebSearch` from answering from memory when the provider cannot search

The tool asked for `webSearch: true` and then invoked the model. That flag becomes `modelOptions.builtIn.webSearch`, which only six of the thirteen registered providers read — `openai`, `anthropic`, `google-genai`, `dashscope`, `mimo`, and `deepseek` on three of its models. The other seven ignore it in silence, including `openai-completions`, the one a gateway is normally configured with.

On those seven the request still went through. A model handed a system prompt that begins "You are a web search retrieval assistant" and ends "Include source title, publisher/site, URL" answers it: findings from training data, with a Sources list that looks exactly like a real one. The tool returned `status: 'success'`, so nothing downstream could tell that no search had happened. The prompt's own "Do not fabricate results, sources, dates, or URLs" was the only thing standing in the way, which is to say nothing was.

The tool now reads the capability before it invokes. `LLMProviderMeta.supportWebSearch` already records it, and `webSearchModels` narrows it per model where a provider declares one, so the check needs no new data. An unsupported provider or model returns `status: 'error'` naming what did not happen and what to do instead — a configured MCP search server, or a model whose provider searches. An agent can act on that; it could not act on a plausible answer.

A conversation on one of the seven providers loses a tool call that appeared to work. That is the repair, not a regression: the results it produced were not retrieved from anywhere.
