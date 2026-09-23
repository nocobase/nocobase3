---
'@nocobase/app-plugin-ai-employee': patch
---

Correct the Skill where a sixth review found rules that held on one code path only

- **Unattended runs.** A job runs as a real, authorized user: a conversation's `userId` references a user, and the data tools authorize through the authorization service rather than `isRoot`, so the Skill recommends a dedicated service account with least privilege. The `skillSettings` allowlist example now names the whole `data-query` → `data-metadata` chain, and the Skill explains that a Skill loading another needs both Skills' tools listed. It names the other tools that pause an unattended run — any `GENERAL` tool not declaring `ALLOW`, including MCP tools, a tool with `execution: 'frontend'` whatever its permission, and the frontend tool loaders a session manifest brings — says a tool aborted mid-call is recorded as failed though its effect may have happened, and loops over repeated interrupts.
- **Fixed agents and errors.** `createAgent({ skills })` now describes the `getSkill` it gets and when its model is resolved; configuration errors at creation are `CONFIGURATION_ERROR`, so the example's `try` covers creation.
- **MCP.** Its tools register as `GENERAL`, are named `mcp-<server>-<tool>`, default to `ALLOW` only when the server's name starts with `get`, and reach every employee; the enable switch and tool permissions now persist.
- **LLM key.** The command reads the key from a hidden prompt instead of a placeholder, writes it so the target's parser reads it back exactly — `$` escaped in `.env`, a single-quoted YAML scalar — creates no file other users can read, avoids the user's aliases, and is verified with a fake value containing quotes, `$`, a backslash and a backtick.
- **API access.** The access groups are listed completely, including the settings-page reads with guards of their own and the model catalog every signed-in user reads; the 401 and unknown-action responses are named; file previews follow the uploader and AI settings access.
- **Smaller corrections.** The internal context provider and persistence are no longer presented as App extension points; the knowledge base row points at AI settings and gains a completion check; `systemPrompt` is the one field that may be `null`; the `autoCall` precedence rule states its precondition; and a stale sentence about PDFs now points at the provider table.
