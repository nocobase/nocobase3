---
name: nocobase-app-plugin-ai-employee
description: Use when a NocoBase App needs an AI employee — "let the assistant read this screenshot and create the record", "add a chat box to this page", "give it a tool that writes a lead", "let it research a company", "configure an LLM service / MCP server / attachment storage", "the composer is disabled and I don't know why". Not for the collections, pages, permissions, or workflows the employee acts on: those stay with nocobase-app-development, and this Skill assumes they already exist.
metadata:
  short-description: Build AI employees, tools, skills, and chat surfaces in a NocoBase App
---

# AI Employee in a NocoBase App

This Skill covers the application-owned half of `@nocobase/app-plugin-ai-employee`: what the App writes, where it writes it, and what the plugin already does so the App does not rebuild it. Work inside a CLI-created App (`pnpm create @nocobase/app <name>`); the current directory is the App root when it holds `client/`, `server/`, and `package.json`.

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

1. `@nocobase/app-plugin-ai-employee` is enabled in `package.json#nocobase.plugins`.
2. `config.yml` declares at least one usable `ai.llmServices` entry. Nothing works without it, and its models must be real — see [capabilities.md § LLM services](references/capabilities.md#llm-services-configyml).
3. Frontend work needs `client/extensions/nocobase-ai/index.ts` to exist. If it does not, install the Registry item first — see [chat-surfaces.md § Install the extension](references/chat-surfaces.md#install-the-extension).
4. Chat attachments need a storage disk decided deliberately — see [capabilities.md § Attachment storage](references/capabilities.md#attachment-storage-configyml).
5. The built-in data tools see only collections registered for authorization as `<connection>.<collection>`, and they hide what they cannot see instead of failing. A collection registered under its bare name is invisible to them — see [capabilities.md § Making a collection visible to the data tools](references/capabilities.md#making-a-collection-visible-to-the-data-tools).

## What to build for what the user asked

| The user wants                                            | Build                                             | Where                                 |
| --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| A chat box on a page                                      | a chat surface behind the readiness gate          | App page                              |
| The assistant to see what is on screen                    | a page element with `getContext`                  | App page                              |
| The assistant to fill a visible form                      | `useAIForm`                                       | App page                              |
| The assistant to change something visible, without saving | a frontend tool                                   | App page element                      |
| The assistant to read or write business data              | a backend tool with declared `dependencies`       | `server/ai/tools/<name>.ts`           |
| The assistant to follow a named procedure                 | a Skill                                           | `ai/skills/<name>/SKILL.md`           |
| A named persona with a fixed set of skills and tools      | an Employee                                       | `server/ai/employees/<name>/index.ts` |
| Tools from an external MCP server                         | `ai.mcpServers`                                   | `config.yml`                          |
| Current information from the web                          | activate the built-in `subAgentWebSearch`         | employee `tools`                      |
| Answers grounded in uploaded documents                    | a knowledge base, then `knowledge-base-retrieve`  | AI settings, then employee `tools`    |
| The assistant to read an image or PDF the user dropped in | nothing — enable attachments and configure a disk | chat surface props, `config.yml`      |

Reach for an App-defined tool before concluding a capability is missing: a backend tool may declare any container token as a dependency, so anything an App service can do, a tool can do. Do not copy a built-in employee, tool, or skill into the App to modify it.

The last two rows of that table are alternatives more often than they look. When the values come from something the model interpreted — a screenshot, a pasted note, a scraped page — prefer filling a visible form the user submits over writing the record directly. Extraction is where a model is least reliable and the fields are exactly what a person can check at a glance, and the built-in form filler never submits, so review is structural rather than a habit. Write directly when the values are already structured, when no one is watching, or when the user asked for it.

## Shortest end-to-end path

Do these in order; each step depends on the one before it.

1. **Configure a model.** Add an `ai.llmServices` entry with `${NAME}` placeholders, verify the key resolves a real model list from the provider, and restart. Verify in the UI that a model is selectable.
2. **Write the tool first, then the skill that names it.** A tool is registered in code; a Skill references it by name and cannot define one. `ai/skills/` holds Skills only.
3. **Aggregate and register.** Static-import employees and tools in `server/ai/index.ts` through a subclass of `AIResourceRegistrar`, then call `registerAIResources()` from an App `ServiceProvider.boot()` with `aiManagerToken`. See [server-runs.md § Register App resources](references/server-runs.md#register-app-resources).
4. **Define the employee.** `defineAIEmployee()` with a stable `username`, a `systemPrompt`, an `avatar` copied from the plugin's list, and explicit `skills` and `tools`. See [capabilities.md § Employees](references/capabilities.md#employees).
5. **Mount a chat surface** behind the readiness gate, enabling attachments when the flow starts from a dropped image or a pasted document.
6. **Verify by observation**, not by reading the source back. Run the checks below.

## Safety

- Credentials belong in the environment. Write `${OPENAI_API_KEY}` in `config.yml`, put the real value in `.env`, and confirm `.env` is in `.gitignore` before writing it. Never commit a key, and never place one in `config.yml.client`, which the browser can read.
- Never invent a model id, a provider `baseURL`, or an avatar key. A wrong model id fails at call time; a wrong avatar key silently renders the fallback avatar. Fetch the model list from the provider, and take avatar keys from the plugin's list.
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
- If attachments are enabled: dropping an image and pasting a document both reach the assistant, and the reply shows it read them.
- App-local `lint`, `typecheck`, `test`, and `build` pass.
- No App file imports a plugin private path, and no changed file lives under `.agents/skills/`.

## References

- [source-map.md](references/source-map.md) — where each App file goes, and what to read before choosing an extension point.
- [capabilities.md](references/capabilities.md) — employees, tools, skills, MCP, knowledge base, avatars, the built-in tools and skills, and the whole `config.yml` `ai` block.
- [chat-surfaces.md](references/chat-surfaces.md) — installing the extension, the readiness gate, surfaces, attachments, page context, forms, frontend tools, renderers, settings pages.
- [server-runs.md](references/server-runs.md) — registering App resources, and running an agent directly from App server code.
- [api-reference.md](references/api-reference.md) — read only when calling `/api/ai` directly instead of through the installed service; the installed transport already covers every normal case.
