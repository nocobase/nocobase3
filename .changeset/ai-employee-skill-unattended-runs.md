---
'@nocobase/app-plugin-ai-employee': patch
---

Correct what the Skill says about running an agent with nobody watching

The Skill's advice for an unattended run did not hold on either factory method. On `createAgent()` it could not, because a tool that asks never paused; that is fixed in this release, and the Skill now says what a fixed agent does with `ALLOW` and `ASK`. On `createAIEmployee()` it could not either: every employee session also reaches the `GENERAL` tools, and two of them always pause — `suggestions` asks, and `formFiller` runs in a browser an unattended run does not have. The Skill now names them and shows how to exclude them, with a session `skillSettings` allowlist, including what `toolsVersion` changes and which system tools pass it regardless.

It also stops promising that an aborted run leaves nothing behind. Only the turn in progress is dropped; the user message, earlier steps and any tool that already ran remain, so a caller reads the conversation before retrying and relies on its tools being safe to repeat. The error contract imports `AgentServiceError` from the public entry, says that `EMPTY_RESPONSE` comes only from `stream()` while `invoke()` resolves with `message: null`, and gives `PROVIDER_ERROR`'s `retryable: false` its actual meaning — the client has already retried transient failures, and a later retry with backoff can still succeed. The interrupt example makes only a decision the action allows, and the Skill explains what `cancelToolCall()` does and why an unattended caller starts a new conversation instead. The decision table and the completion checks gain an entry for an unattended run.
