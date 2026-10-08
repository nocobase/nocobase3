---
'@nocobase/app-plugin-agents': minor
---

A model service can send request headers of its own with every call. Each header has a name, a value and whether it is secret: a secret value is sealed with the secrets keys like the API key, rotated with it, and never answered (`valueSet` says whether one is saved). Headers HTTP decides, the credentials' (`authorization`, `x-api-key` and the like) and `user-agent` cannot be set. A call to an OpenCode base URL (Zen or Go) carries `x-opencode-session` automatically, as OpenCode Go requires: the same session id for every model call of a conversation and a new one for each call outside any, so no service setting is needed. Every request to a provider now names the plugin first in its user agent (`nocobase-agents/<version>`). The service form says which provider type serves which of OpenCode's model families. The migration `202610080001_ag_add_model_service_headers` adds the `headers` and `headersEncrypted` columns to `agModelServices`.
