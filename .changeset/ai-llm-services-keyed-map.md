---
'@nocobase/app-plugin-ai-employee': minor
---

Key `ai.llmServices` by service name, and read secrets through the application's `env` mapping

**Breaking.** `ai.llmServices` is now a map keyed by service name, like `ai.mcpServers`, instead of a list of entries that each carry a `name`. The list form, and a `name` field inside an entry, are rejected at startup with a message naming the path. Each service therefore has a stable configuration path, such as `ai.llmServices.openai.options.apiKey`, which `pnpm nocobase config set` can write and an `env` mapping can target; neither can address an item of a list.

**Breaking.** `${NAME}` in `ai.llmServices` and `ai.mcpServers` is no longer expanded, and `expandEnvironmentReferences` is no longer exported. The plugin read those values from `process.env`, which a built server started with `pnpm start` does not merge `.env` into, so a key kept in `.env` became an empty string there. A secret now reaches a field the way every other section's does: the application declares it in `env` of its `server/config/ai.ts`, which reads the process environment together with `.env` and `.env.local` in development and in a built server alike, and `pnpm nocobase config env` lists it.

To upgrade an application:

1. In `config.yml` and `config.example.yml`, move each `ai.llmServices` entry under its name and delete its `name` field — `- name: openai` followed by its fields becomes `openai:` followed by the same fields.
2. For each `${NAME}` under `ai.llmServices` or `ai.mcpServers`, write the value into the untracked `config.yml` with `pnpm nocobase config set --from-env <path>=<VARIABLE>`, such as `ai.llmServices.openai.options.apiKey=OPENAI_API_KEY`. Where the environment injects the key instead, remove the value and map the variable in `server/config/ai.ts`, switching it to the object form of `defineAppConfig` if it still uses a function: `env: { OPENAI_API_KEY: envString('llmServices.openai.options.apiKey') }`, with `envString` from `@nocobase/app-server/config`. Either way the value is the whole field, so a header such as `Authorization: Bearer ${TOKEN}` needs `Bearer <token>`.
3. Run `pnpm nocobase config env` to confirm each variable is listed and set, and `pnpm nocobase config check`, which now warns about any `${NAME}` left in either section.
