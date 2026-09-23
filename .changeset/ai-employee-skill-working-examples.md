---
'@nocobase/app-plugin-ai-employee': patch
---

Point the AI employee Skill at the plugin's working example pages

The plugin ships a working page for each frontend capability — chat containers, the floating chat, tasks, page context and forms, and tool renderers — live under `/dev/ai-components/` while `pnpm dev` runs and built into the published package under `dist/client/dev/demo/`. The Skill now maps each page to its files, tells an agent to start from the matching one, and lists what not to copy from it: the relative Registry imports, the configuration gate that falls back to a preview service, the missing `defaultEmployee`, and the demo presentation.
