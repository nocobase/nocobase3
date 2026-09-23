---
'@nocobase/app-plugin-ai-employee': patch
---

Correct the Skill where a fifth review found it described one code path as the rule

- **An employee Skill is one file.** `getSkill` hands the model the body of `SKILL.md` and nothing else, so `references/` pages beside it are for the people maintaining it; a Skill written in the layout of an agent Skill gives the model links it cannot follow. The build still copies them, and the Skill no longer implies that makes them reachable.
- **Development and a built server differ in two places.** A relative `ai.skills.paths` resolves inside `dist/` on a built server and is skipped in silence, and names the loader takes from a Skill's `tools/` directory disappear from the build, so a tool they gate is gated in development only.
- **A config entry rewrites more than it looks.** For an existing service, `options`, `modelOptions`, title and `sort` are replaced from `config.yml` on every load — an entry without `modelOptions` resets the settings page's tuning to the defaults. The README says the same, and the default-model paragraph now credits `sort` rather than `overrideEnabledModels`.
- **The PDF column says what the plugin sends.** "as a document" is a `file` block, not a promise the far end reads it; Ollama now extracts text, and the gateway providers depend on their endpoint.
- **Authorizing from `ctx.actor` is shown.** A tool has no request scope, so the Skill shows the service building one with the same subjects the middleware adds, `resolveFor` included, and hands the decision to the authorization Skill.
- **A failed direct query does not say why.** Unregistered, missing `read` and not granted produce the same message, so the Skill no longer calls it the way to tell them apart.
- **`autoCall` on a listed `CUSTOM` tool replaces `defaultPermission`.** Leaving it out makes an `ALLOW` tool ask, and the value stored on first registration outlives later changes in code.
