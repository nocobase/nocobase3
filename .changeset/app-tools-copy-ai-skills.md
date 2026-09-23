---
'@nocobase/app-tools': patch
---

Carry the application's AI Skills into the build

`tsc` emits only TypeScript, and a Skill is a `SKILL.md`, so nothing carried `ai/skills` into `dist`. The AI Employee plugin reads the application's Skills from `<applicationRoot>/ai/skills`, and a deployed server's application root is `dist` — it resolves its own paths from `dist/server`. The directory was therefore never there, and a missing Skill directory is logged at debug level and skipped, so an application's own Skills worked in development and disappeared once deployed with nothing reported.

The build now copies them, next to the step that copies external Collection metadata for the same reason. Markdown travels, not only `SKILL.md`: a Skill may split its detail into a `references/` directory that `SKILL.md` links to, and a Skill deployed without the pages it points at is worse than one that is absent. Nothing else travels, because tools are registered in code and a Skill names them in its frontmatter, so a Skill directory holds no implementation a deployment reads. An application with no `ai/` — which is every application `create-app` generates — copies nothing and the step is silent.

The plugin's own built-in Skills were never affected; its build already copies them, and an installed plugin also ships them at its package root.
