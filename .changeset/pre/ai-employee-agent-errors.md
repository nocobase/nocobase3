---
'@nocobase/app-plugin-ai-employee': minor
---

Classify agent failures, and report the real one

An agent failure used to reach the caller as `Agent execution failed` with the code `PROVIDER_ERROR`, whatever had gone wrong, and `invoke()` discarded the underlying message on every run. Failures are now classified by the phase they occur in:

- Anything thrown while resolving the model, the LLM service or the provider is `CONFIGURATION_ERROR`, a new `AgentServiceErrorCode`. `createAgent()` resolves its model and service completely when the agent is created and rejects there; `createAIEmployee()` rejects at creation only when the employee has no usable model at all, and otherwise when the run starts.
- `invoke()` and `stream()` report the same message for the same failure, and `AgentServiceError.rootMessage` returns the deepest message in the cause chain, so a caller no longer walks `cause` itself. A provider without `parseResponseError()` no longer turns the failure being reported into a `TypeError`.
- `AgentServiceError` and `AgentServiceErrorCode` are exported from `@nocobase/app-plugin-ai-employee/server`, so a caller can check `instanceof`, read `code` and `retryable`, and decide whether to retry.
- Over HTTP the chat actions answer `200` with an SSE body whatever the run does, and a failed run arrives as an `error` event; that event now carries the failure's `code` when it is an `AgentServiceError`.

**Breaking:** a caller that switches exhaustively over `AgentServiceErrorCode` has to handle `CONFIGURATION_ERROR`, and one that matched the literal message `Agent execution failed` now receives the real message instead.
