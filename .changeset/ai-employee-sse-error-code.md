---
'@nocobase/app-plugin-ai-employee': patch
---

Name the agent failure in a chat's error event

A chat request always answers `200` with an SSE body, and a failed agent run arrives as an `error` event carrying only its message, so a caller could not tell a missing model from a provider outage without matching text. When the failure is an `AgentServiceError`, the event now also carries its `code` — `CONFIGURATION_ERROR`, `PROVIDER_ERROR` and the rest — for both streamed and non-streamed requests. Existing fields are unchanged.
