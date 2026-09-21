---
'@nocobase/app-plugin-ai-employee': patch
---

Classify agent configuration failures, and stop `invoke()` from discarding the message that says what went wrong

An agent running without a usable model failed with `AgentServiceError: Agent execution failed` and the code `PROVIDER_ERROR`. What actually happened — `LLM service not found`, `LLM service not configured`, `Fixed agent model is required` — survived only inside `cause`, so every consumer had to walk the cause chain and match strings to tell a misconfigured application apart from a provider outage, and `AIConversationService` reported the whole class as HTTP 500.

The message was discarded deliberately, by an argument named as though it were a fallback. `normalizeAgentError(error, fallbackMessage)` preferred `fallbackMessage` over `cause.message`, and `executeInvoke` passed the constant `'Agent execution failed'`, so the real message was overwritten on every invocation. `executeStream` passed `provider.parseResponseError(error)`, which no provider overrides and which returns `err.message`, so the streaming path reported the real failure all along. The two paths disagreed about the same failure, and the package's own lifecycle test encoded the disagreement: it asserted `'prepare failed'` for `stream()` and `'Agent execution failed'` for `invoke()`.

Failures are now classified by the phase they occur in rather than by their message. Anything thrown while resolving the model, the LLM service, or the provider is a `CONFIGURATION_ERROR`, a new `AgentServiceErrorCode`; a configuration failure added later needs no change here and no new string to match. `normalizeAgentError` now prefers the cause's own message, and `executeInvoke` asks the provider to parse the error the way `executeStream` does instead of passing a constant, so both paths report the same thing.

`AgentServiceError.rootMessage` returns the deepest message in the cause chain, guarding against cycles, so a consumer reporting a failure no longer writes its own traversal. `AIConversationService` maps the code to a status — 503 for a configuration failure, 502 for a provider or model failure, 422 for a recursion limit, 499 for an abort — and reports `rootMessage` rather than the wrapper's.

A consumer that switches exhaustively over `AgentServiceErrorCode` has to handle `CONFIGURATION_ERROR`. One that matched on the literal message `'Agent execution failed'` from `invoke()` no longer sees it, which is the point: the real message is there instead. HTTP responses for these failures move off 500 to the statuses above.
