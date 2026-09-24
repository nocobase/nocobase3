---
'@nocobase/app-plugin-ai-employee': patch
---

Cover the AI manager's runtime extensions in the AI employee Skill

The Skill gains a `runtime-extensions.md` reference for what an App does past `AIResourceRegistrar`: dynamic tools, model and provider lookups, a custom LLM provider with its embedding class and `config.yml` service, and a direct model call through a provider. It replaces the separate `nocobase-ai-employee` Skill that sat unpublished in the `@nocobase/ai-employee` package, which no App ever received and which still described an older integration — a plugin `bootstrap.ts` with `deps.ai`, resources scanned from an `ai/` directory, and MCP servers registered from code.
