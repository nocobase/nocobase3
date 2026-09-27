---
'@nocobase/app-cli': patch
'@nocobase/app-skills': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
---

Follow `ai.llmServices` becoming a map keyed by service name, with secrets mapped through `env`

`config check` now reports a `${NAME}` under `ai.llmServices` and `ai.mcpServers` as literal text, as it already did for every other section, since the AI employee plugin no longer expands one. The templates default `ai.llmServices` to an empty map, show the map form in `config.example.yml`, and declare `server/config/ai.ts` in the object form of `defineAppConfig` with an empty `env` for an application's own mappings. The application development Skill no longer names the AI sections as an exception.
