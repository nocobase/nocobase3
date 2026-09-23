---
'@nocobase/app-plugin-ai-employee': patch
---

Correct the AI employee Skill where its rules held on one code path only

- **Unattended runs.** A job runs as a real, authorized user: a conversation's `userId` references a user, and the data tools authorize through the authorization service rather than `isRoot`, so the Skill recommends a dedicated service account with least privilege. The `skillSettings` allowlist example names the whole `data-query` → `data-metadata` chain, and the Skill explains that a Skill loading another needs both Skills' tools listed. It names the other tools that pause an unattended run — any `GENERAL` tool not declaring `ALLOW`, including MCP tools, a tool with `execution: 'frontend'` whatever its permission, and the frontend tool loaders a session manifest brings — says a tool aborted mid-call is recorded as failed though its effect may have happened, and shows how to answer repeated interrupts.
- **Fixed agents and errors.** `createAgent({ skills })` describes the `getSkill` it gets and when its model is resolved; configuration errors at creation are `CONFIGURATION_ERROR`, so the example's `try` covers creation.
- **MCP.** Its tools register as `GENERAL`, are named `mcp-<server>-<tool>`, and reach every employee whose tool selection has never been saved; a tool defaults to `ALLOW` only when the tool's own name starts with `get`. The enable switch and tool permissions persist.
- **LLM key.** The command reads the key from a hidden prompt instead of a placeholder, writes it so the target's parser reads it back exactly — a single-quoted scalar in YAML, and in `.env` a `\$` for each `$` that would otherwise start a variable reference — creates no file other users can read, avoids the user's aliases, and is verified with fake values.
- **API access.** The access groups are listed completely, including the settings-page reads with guards of their own and the model catalog every signed-in user reads; the 401 and unknown-action responses are named; file previews follow the uploader and AI settings access.
- **Chat surfaces.** An employee whose tool selection was saved does not pick up MCP tools discovered later.
- **Smaller corrections.** The internal context provider and persistence are no longer presented as App extension points; the knowledge base row points at AI settings and gains a completion check; `systemPrompt` is the one field that may be `null`; the `autoCall` precedence rule states its precondition; and a stale sentence about PDFs now points at the provider table.
