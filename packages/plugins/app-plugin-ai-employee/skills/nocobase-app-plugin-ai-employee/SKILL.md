---
name: nocobase-app-plugin-ai-employee
description: Use when a NocoBase App needs an AI employee — "add a chat box to this page", "let it answer from what is on this screen", "give it a tool that writes to one of our collections", "let it fill this form for me", "let the assistant read the file I dropped in", "have it summarize our data", "configure an LLM service / MCP server / attachment storage", "run an agent from a job instead of a chat", "the composer is disabled and I don't know why". Not for the collections, pages, permissions, or workflows the employee acts on: those stay with nocobase-app-development, and this Skill assumes they already exist.
metadata:
  short-description: Build AI employees, tools, skills, and chat surfaces in a NocoBase App
---

# AI Employee in a NocoBase App

This Skill covers the application-owned half of `@nocobase/app-plugin-ai-employee`: what the App writes, where it writes it, and what the plugin already does so the App does not rebuild it. Work inside a CLI-created App (`pnpm create @nocobase/app <name>`); the current directory is the App root when it holds `client/`, `server/`, and `package.json`.

Ignore any globally installed NocoBase 2 AI Skill. They answer to the same words — "AI employee", "AI manager" — and describe a different product with different APIs.

## Ownership

```text
App owns       employees, backend tools, skills, config.yml, page composition,
               business collections, business authorization, invocation timing
Plugin owns    chat transport and SSE, conversation persistence, tool approval,
               attachment parsing, built-in tools and skills, LLM providers, /api/ai
Public entry   @nocobase/ai-employee root, @nocobase/app-plugin-ai-employee/server,
               the nocobase-ai Registry item installed at client/extensions/nocobase-ai
Do not bypass  plugin server/agent source paths, @nocobase/ai-employee/src/*,
               the synchronized copy under .agents/skills/
```

An importable subpath is not a runtime contribution. `@nocobase/app-plugin-ai-employee/server` exports tokens and the registrar base class; importing it never registers anything. Registration happens in the App's own Provider, once, in `boot()`.

Import a token from the package that created it. `createServiceToken` is keyed by object identity, so a second `createServiceToken('ai-manager')` is a different key that resolves nothing.

## Prerequisites

1. `@nocobase/app-plugin-ai-employee` is registered in `server/plugins.ts` and `client/plugins.ts`. Those two files are the registration; `package.json#nocobase` carries template metadata and no plugin list, so do not look for one there or add one.
2. `config.yml` declares at least one usable `ai.llmServices` entry. Nothing works without it, its models must be real, and where its key lives is the user's choice among three places — see [capabilities.md § LLM services](references/capabilities.md#llm-services-configyml) and [§ Where the key lives](references/capabilities.md#where-the-key-lives).
3. Frontend work needs `client/extensions/nocobase-ai/index.ts` to exist. If it does not, install the Registry item first — see [chat-surfaces.md § Install the extension](references/chat-surfaces.md#install-the-extension).
4. Chat attachments need a storage disk decided deliberately — see [capabilities.md § Attachment storage](references/capabilities.md#attachment-storage-configyml).
5. Business data the assistant should read is already authorized, and its authorization resource id is two-part — `<connection>.<collection>`. The built-in data tools skip a bare `orders`, and what they skip disappears in silence: discovery returns no data sources at all, not one missing table, so the symptom points at the database configuration rather than the grant. Authorization itself belongs to the `nocobase-app-plugin-authorization` Skill; what this plugin requires of it is in [capabilities.md § What the data tools can see](references/capabilities.md#what-the-data-tools-can-see).

## Known gaps in this version

One thing does not yet work the way it should. It is an open defect rather than intended behaviour, and a fix is planned; it cannot be fixed from the App in the meantime, so work around it until the release that closes it. If you are reading this from a newer version of the plugin, check whether it still applies before designing around it.

- **`.env` works only under `pnpm dev`.** `${NAME}` in `ai.llmServices` and `ai.mcpServers` expands from `process.env`. `pnpm dev` passes a merged environment to the server process, so it works; `pnpm start` loads the built server in-process and the application's `.env` is not merged into `process.env`, so the placeholder becomes an empty string and the provider reports an authentication failure. Until that is fixed, `.env` is the last of the three places a key can live, and a deployment sets a real environment variable or writes the value into its own `config.yml`.

## What to build for what the user asked

| The user wants                                            | Build                                                           | Where                                 |
| --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| A chat box on a page                                      | a chat surface behind the readiness gate                        | App page                              |
| The assistant to see what is on screen                    | a page element with `getContext`                                | App page                              |
| The assistant to fill a visible form                      | `useAIForm`                                                     | App page                              |
| The assistant to change something visible, without saving | a frontend tool                                                 | App page element                      |
| The assistant to read or write business data              | a backend tool with declared `dependencies`                     | `server/ai/tools/<name>.ts`           |
| The assistant to follow a named procedure                 | a Skill                                                         | `ai/skills/<name>/SKILL.md`           |
| A named persona with a fixed set of skills and tools      | an Employee                                                     | `server/ai/employees/<name>/index.ts` |
| Tools from an external MCP server                         | `ai.mcpServers`                                                 | `config.yml`                          |
| Current information from the web                          | `subAgentWebSearch`, if the provider searches                   | employee `tools`                      |
| Answers grounded in uploaded documents                    | a knowledge base, which needs a plugin that enables the feature | AI settings, then employee `tools`    |
| The assistant to read an image or PDF the user dropped in | nothing — enable attachments and configure a disk               | chat surface props, `config.yml`      |

Reach for an App-defined tool before concluding a capability is missing: a backend tool may declare any container token as a dependency, so anything an App service can do, a tool can do. Do not copy a built-in employee, tool, or skill into the App to modify it.

Two of those rows are alternatives more often than they look. When the values were interpreted by the model rather than supplied as data — read out of an uploaded file, extracted from free text, taken off a page it fetched — prefer filling a visible form the user submits over writing the record directly. Extraction is where a model is least reliable and the fields are exactly what a person can check at a glance, and the built-in form filler never submits, so review is structural rather than a habit. Write directly when the values are already structured, when no one is watching, or when the user asked for it.

## Shortest end-to-end path

Do these in order; each step depends on the one before it.

1. **Configure a model.** Agree with the user where the key lives, confirm that place stays out of the repository, and hand them the command that sets it — see [capabilities.md § Where the key lives](references/capabilities.md#where-the-key-lives). Add an `ai.llmServices` entry with a real `enabledModels` list fetched from the provider, record it in `config.example.yml` with `${NAME}` in place of any value, and restart the server, which reads its environment, `config.yml` and `.env` only when it starts. Verify in the UI that a model is selectable. `enabledModels` is applied when the service row is first created and ignored afterwards unless the service sets `overrideEnabledModels`, so getting it right now matters more than it looks — see [capabilities.md § LLM services](references/capabilities.md#llm-services-configyml).
2. **Write the tool first, then the skill that names it.** A tool is registered in code; a Skill references it by name and cannot define one. `ai/skills/` holds Skills only.
3. **Aggregate and register.** Static-import employees and tools in `server/ai/index.ts` through a subclass of `AIResourceRegistrar`, then call `registerAIResources()` from an App `ServiceProvider.boot()` with `aiManagerToken`. See [server-runs.md § Register App resources](references/server-runs.md#register-app-resources).
4. **Define the employee.** `defineAIEmployee()` with a stable `username`, a `systemPrompt`, an `avatar` copied from the plugin's list, and the `skills` that bring its tools — list a tool in `tools` only when no Skill names it. See [capabilities.md § Employees](references/capabilities.md#employees).
5. **Mount a chat surface** behind the readiness gate, passing `defaultEmployee` so the page opens on the App's employee rather than whichever one sorts first — the built-in `atlas` has `sort: 0` and wins by default. Enable attachments when the flow can start from an uploaded file.
6. **Verify by observation**, not by reading the source back. Run the checks below.

## Safety

- A key never enters the repository and never passes through the agent. Prefer a system environment variable referenced as `${OPENAI_API_KEY}`; a value written into `config.yml` only once it is confirmed ignored and untracked; `.env` last, and only for `pnpm dev`. Give the user a command with a placeholder to run in their own terminal — never ask for the key, never write it yourself, and never print a file or variable that holds it. A deployment has its own `config.yml` and its own environment, and both need the key checked before the first start. Never place a key under `config.yml`'s `client:` block, which the browser can read.
- Never invent a model id, a provider key, a provider `baseURL`, or an avatar key. A wrong model id fails at call time, but a wrong provider key and a wrong avatar key both fail silently — an unregistered provider drops the whole service out of the model list, and an unknown avatar renders the fallback face. Fetch the model list from the provider, copy provider keys from the table, and take avatar keys from the plugin's list.
- `defaultPermission: 'ALLOW'` is for reversible, local, low-consequence actions. Anything that persists, charges, sends, or deletes stays `ASK`.
- A tool that writes business data owns three things the runtime will not do for it: authorize against `ctx.actor`, keep its writes in one transaction, and make a repeat call safe. A model retries.
- Context and tool results must survive structured cloning. Never send DOM nodes, callbacks, class instances, credentials, or unbounded record sets.
- After a stream disconnects, read the conversation before doing anything. Do not resend a mutation blindly, and do not create a second conversation.
- Never modify or deep-import plugin internals to finish an App feature. If a public surface is genuinely missing, say so and stop.

## Completion checks

- A first-time visitor lands on the page, sees a usable composer without switching employee or model, sends, and gets a reply. Reload and repeat: this tests a fresh mount, not a warm one.
- Each unhappy configuration shows its own actionable message rather than a composer that looks ready: discovery loading, discovery failed, no accessible employees, model discovery failed, no enabled models.
- The App employee, tool, and skill appear in AI settings after start, and the employee's tool list shows exactly what was declared.
- The new tool runs from chat, is approved when its permission is `ASK`, returns a serializable result, and leaves the expected database row behind. Run it twice and verify no duplicate.
- An unauthorized user is refused by the tool, not only by the prompt.
- The employee the page opens on is the one intended, not whichever sorts first.
- If web search is activated: ask something that needs it and confirm the answer is retrieved rather than recalled. On a provider without built-in search the tool now reports that no search ran; that error is the correct outcome, not a bug to route around.
- If attachments are enabled: dropping an image and pasting a document both reach the assistant, and the reply shows it read them.
- App-local `lint`, `typecheck`, `test`, and `build` pass.
- No App file imports a plugin private path, and no changed file lives under `.agents/skills/`.

## References

- [source-map.md](references/source-map.md) — where each App file goes, and what to read before choosing an extension point.
- [capabilities.md](references/capabilities.md) — employees, tools, skills, MCP, knowledge base, avatars, the built-in tools and skills, and the whole `config.yml` `ai` block.
- [chat-surfaces.md](references/chat-surfaces.md) — installing the extension, the readiness gate, surfaces, attachments, page context, forms, frontend tools, renderers, settings pages.
- [server-runs.md](references/server-runs.md) — registering App resources, and running an agent directly from App server code.
- [api-reference.md](references/api-reference.md) — read only when calling `/api/ai` directly instead of through the installed service; the installed transport already covers every normal case.
