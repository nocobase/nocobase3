# AI Capabilities an App Defines

What an App can add to the AI Employee runtime, what is already there, and the `config.yml` block that turns it on. Every shape here is the current public contract; keep names and enum values exact, and treat "optional" as "may be omitted", never as "may be `null`".

## Table of contents

- [Where each resource is registered](#where-each-resource-is-registered)
- [Employees](#employees)
- [Avatars](#avatars)
- [Backend tools](#backend-tools)
- [Writing business data from a tool](#writing-business-data-from-a-tool)
- [Skills](#skills)
- [Tool and Skill display i18n](#tool-and-skill-display-i18n)
- [Built-in employee, tools, and skills](#built-in-employee-tools-and-skills)
- [Making a collection visible to the data tools](#making-a-collection-visible-to-the-data-tools)
- [Three ways to reach outside the App](#three-ways-to-reach-outside-the-app)
- [LLM services (`config.yml`)](#llm-services-configyml)
- [MCP servers (`config.yml`)](#mcp-servers-configyml)
- [Attachment storage (`config.yml`)](#attachment-storage-configyml)
- [Extra Skill directories (`config.yml`)](#extra-skill-directories-configyml)
- [Knowledge base](#knowledge-base)

## Where each resource is registered

There is one registration path per resource kind. A second path does not exist, so do not look for one.

| Resource     | Declared in                                  | Registered by                                                   |
| ------------ | -------------------------------------------- | --------------------------------------------------------------- |
| Backend tool | `server/ai/tools/<name>.ts`, `defineTools()` | static import into `server/ai/index.ts`, then the App registrar |
| Employee     | `server/ai/employees/<name>/index.ts`        | static import into `server/ai/index.ts`, then the App registrar |
| Skill        | `ai/skills/<name>/SKILL.md`                  | directory scan for `**/SKILL.md`, by the plugin                 |
| MCP server   | `config.yml` `ai.mcpServers`                 | the plugin, on config load                                      |
| LLM service  | `config.yml` `ai.llmServices`                | the plugin, on config load                                      |

There is no filesystem scan for employees or tools, and a Skill directory carries no tool definitions — a Skill's `tools` array names tools that are already registered in code. So the order is: write the tool, register it, then write the Skill that names it. See [server-runs.md § Register App resources](server-runs.md#register-app-resources) for the registrar and the Provider that calls it.

Registration runs in one fixed order: tools, MCP, skills, employees. An employee may therefore name any skill or tool, and a skill may name any tool.

## Employees

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'order-desk', // required, stable key; conversations are stored against it
  nickname: 'Order desk',
  position: 'Order support',
  avatar: 'nocobase-016-female', // must be a key from the plugin's list; see Avatars
  description: 'Answers questions about orders and records new ones.',
  bio: 'I look up order history, and create an order once you give me the details.',
  greeting: 'Ask me about an order, or give me the details for a new one.',
  category: 'business',
  sort: 10,
  systemPrompt: `You help staff look up and record orders. ...`,
  skills: ['order-intake'],
  tools: [
    { name: 'create-order' },
    { name: 'dataSourceQuery', autoCall: true },
  ],
  chatSettings: {
    systemPromptMode: 'default',
    enableSkills: true,
    enableTools: true,
  },
});
```

`AIEmployeeOptions` is exactly: `username`, `category?`, `description?`, `skills?`, `tools?`, `chatSettings?`, `avatar?`, `nickname?`, `position?`, `bio?`, `greeting?`, `systemPrompt?`, `sort?`. Nothing else is accepted. In particular there is no `knowledgeBase` field and no `prompt.md` convention: the prompt is the `systemPrompt` string, and knowledge-base binding is a settings-page decision on the persisted employee.

`username` is the identity everything else uses — chat requests, `AIEmployeeShortcut.aiEmployee`, tasks, sub-agent dispatch, stored conversations. Changing it after users have conversations orphans them.

`tools[].name` must match a registered tool name exactly. `autoCall: true` opts the tool into the runtime's automatic-call policy; it does not bypass approval, so a tool whose `defaultPermission` is `ASK` still asks.

`skills` and `tools` are the employee's declared capability set. A `SPECIFIED` tool reaches an employee only through this list or through a Skill the employee has; a `GENERAL` tool is available to every employee without being listed.

The persisted employee record carries more than the definition does — `enabled`, `builtIn`, `deprecated`, `about`, `defaultPrompt`, `skillSettings`, `knowledgeBase`, model settings, roles. Those are administered in AI settings. Do not put them in the definition.

## Avatars

The plugin ships 60 avatars, keyed `nocobase-001-…` through `nocobase-060-…`. The male/female suffix is fixed per number and is not free to choose: `nocobase-016-female` exists, `nocobase-016-male` does not.

An unrecognized key does not raise an error. It silently falls back to `nocobase-003-female`, so a made-up key produces a working page with the wrong face and nothing in the logs. Read the real keys before writing one, from the installed package:

```bash
grep -oE "'nocobase-[0-9]{3}-(male|female)'" \
  node_modules/@nocobase/app-plugin-ai-employee/dist/client/avatars.js | sort -u
```

Use one of those keys, or a `data:`, `blob:`, or `http(s)://` URL, which are passed through unchanged. Pick an avatar for a new employee without asking; it is a default, not a decision the user needs to make. Ask only if the user raised it.

## Backend tools

```ts
import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import { orderServiceToken } from '../services/order-service.js';

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ASK',
  i18n: { namespace: '@acme/example-app' }, // this App's real package.json name
  introduction: {
    title: 'Create order',
    about: 'Record a new order for a customer.',
  },
  definition: {
    name: 'create-order',
    description: 'Create one order. Call once per order.',
    schema: z.object({
      customer: z.string(),
      product: z.string(),
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    }),
  },
  dependencies: { orders: orderServiceToken },
  invoke: async (ctx, args) => {
    const order = await ctx.deps.orders.create(ctx.actor, args);
    return { status: 'success', content: { id: order.id } };
  },
});
```

`defineTools` is generic over the **dependency token map**, not over a context type. Write `defineTools({ … })` and let `TDeps` be inferred from `dependencies`; writing `defineTools<AgentContext<…>>({ … })` is wrong and will not compile.

| Field               | Values                               | What it decides                                                                         |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `scope`             | `SPECIFIED` \| `GENERAL` \| `CUSTOM` | `GENERAL` reaches every employee; `SPECIFIED` must be activated by an employee or skill |
| `execution`         | `backend` \| `frontend`              | where `invoke` runs; App tools under `server/ai/tools/` are `backend`                   |
| `defaultPermission` | `ASK` \| `ALLOW`                     | whether the user approves each call                                                     |
| `requiresContext`   | boolean                              | whether the tool needs the agent context at all                                         |
| `silence`           | boolean                              | whether the call is hidden from the conversation UI                                     |
| `from`              | `loader` \| `workflow` \| `mcp`      | provenance; leave unset for an App tool                                                 |
| `dependencies`      | a map of names to container tokens   | what arrives on `ctx.deps`                                                              |

Return `{ status: 'success' | 'error', content: unknown }` and keep `content` serializable. `definition.schema` must describe the argument object exactly; a model sends nothing that is not declared.

### What a tool receives

```ts
interface AgentContext<TDeps = Record<string, never>> {
  deps: TDeps; // exactly the tokens this tool declared, resolved
  actor: {
    id: string | number;
    roles: string[];
    isRoot: boolean;
    locale?: string;
  };
  state: AgentState; // what this execution is
  runtime: AgentRuntime; // what the host lends it while it runs
  availableSkills?: () => Promise<readonly SkillsEntity[]>;
}

interface AgentState {
  sessionId: string; // always present
  messageId?: string;
  handoffMessages?: AIMessageInput[]; // only when handing an interrupted sub-agent its message
  model?: { llmService: string; model: string }; // already resolved; read as given
  webSearch?: boolean;
  important?: string;
  frontendTools?: unknown[];
  toolCallResults?: { id: string; result: unknown }[];
  timezone?: string;
}

interface AgentRuntime {
  logger: Logger;
  translate?: (key: string, options?: Record<string, unknown>) => string;
  getHeader?: (name: string) => string | undefined; // absent when no request
}
```

There is no ambient handle to the database, the container, or the App's managers. There is no `ctx.logger`, no `ctx.translate`, no `ctx.repositories`, no `ctx.services`, and no `ctx.state.messages`. Log through `ctx.runtime.logger`, localize through `ctx.runtime.translate`, and read the timezone from `ctx.state.timezone` rather than the `x-timezone` header, which the route already resolved.

`dependencies` is the only way in. Each token is resolved from the **App container**, so an App tool declares the App's own service tokens — the same ones the App's routes use. A token the container cannot resolve fails the execution with an error naming the tool and the token, rather than surfacing as an undefined property halfway through.

`ctx.actor` is the authorization identity. A model can put anything in its arguments, including a user id; never treat an argument as authorization.

## Writing business data from a tool

A tool that writes owns three things the runtime will not do for it.

**Authorize.** The check belongs in the tool, against `ctx.actor`, not in the prompt and not in the schema. Prefer declaring an App service token that already enforces the App's rules over declaring a raw database handle: the built-in data tools do exactly this, resolving an actor-bound service and passing `ctx.actor` into it, so no read reaches a collection unauthorized.

**Transact.** One tool call should leave one consistent state. If the write spans several collections, own the transaction inside the App service the tool declares.

**Be idempotent.** A model retries — after a timeout, after a disconnect, after being told the answer looked wrong. Two identical calls must not produce two rows. Key the write on something the caller supplies or the data determines, and return the existing record rather than failing when it is already there.

Also: set `defaultPermission: 'ASK'` on anything that persists, and return the created identifier in `content` so the conversation can reference it afterwards.

## Skills

A Skill is a Markdown file at `ai/skills/<name>/SKILL.md` — a procedure the model loads on demand, not a container for code.

```yaml
---
scope: SPECIFIED # SPECIFIED | GENERAL | CUSTOM; defaults to SPECIFIED
name: order-intake # required, stable, matches the directory
description: Record a new order once the customer, product and quantity are confirmed.
i18n:
  namespace: '@acme/example-app'
introduction:
  title: Order intake
tools:
  - create-order
  - getSkill
---
# Order intake

1. Confirm the customer, the product and the quantity before creating anything.
...
```

`name` and `description` are required; `scope` defaults to `SPECIFIED`. `description` is model-facing — it is what the model reads to decide whether to load the Skill — so write it as a trigger, not as a title. The Markdown body is the Skill content handed to the model.

`tools` names tools that are **already registered in code**. A Skill directory defines no tool. The loader does scan a `tools/` subdirectory, but it only takes filenames from it and appends them to this same list of names, so a source file placed there without a matching registration in `server/ai/tools/` contributes a dead name that resolves to nothing. Keep tool source under `server/ai/tools/` and name it in the frontmatter.

The plugin loads Skills from its own package root first, then the App root's `ai/skills`, then any directory listed in `ai.skills.paths`. Later directories register later.

## Tool and Skill display i18n

Declare top-level `i18n: { namespace: '<the owning package.json name>' }` on any Tool or Skill that wants translated display metadata. The namespace is the real package name of whoever owns the resource — this App, or the plugin that ships it — never a display name, a Skill name, the renderer's package, or a sentinel. A dynamic tool provider must put it on each returned resource. A Skill and the Tools it references are independent resources: a Tool keeps its own namespace and does not inherit the Skill's.

Tool `introduction.title` and `introduction.about`, and Skill `introduction.title` and `description`, hold readable English source text, and that exact text is the translation key — punctuation, spaces, capitalization and all. This is the one place where the usual semantic-key rule does not apply. Do not substitute identifiers or `{{t(...)}}` templates, and do not add a Skill `about` field for this purpose.

```ts
// client/locales/en-US.ts — the English-to-English entry is required, not optional
export default {
  'Create order': 'Create order',
  'Record a new order for a customer.': 'Record a new order for a customer.',
};

// client/locales/zh-CN.ts
export default {
  'Create order': '创建订单',
  'Record a new order for a customer.': '为客户创建一条新订单。',
};
```

Register these through the owner's **client** locale contribution in `client/locales/`. Server locale resources do not supply display translations.

Translation is display-only. Stable names, Tool `definition.description`, schemas, Skill instruction bodies, persisted values, and anything else the model reads stay unchanged. A resource without a namespace, or a key without an entry, displays its source text. Catalogs sort by localized title with the stable `name` as tie-breaker, so switching locale must change both labels and order.

## Built-in employee, tools, and skills

One built-in employee: `atlas`, a router that analyses a request and delegates to a specialist through the three sub-agent tools. Use it as-is; do not copy its definition into the App.

Nineteen built-in tools:

| Tool                      | Scope       | Typical use                                                         |
| ------------------------- | ----------- | ------------------------------------------------------------------- |
| `getDataSources`          | `SPECIFIED` | List the authorized named database connections                      |
| `getCollectionNames`      | `SPECIFIED` | Find which collections the current user may read                    |
| `getCollectionMetadata`   | `SPECIFIED` | Read a collection's accessible fields and relations before querying |
| `searchFieldMetadata`     | `SPECIFIED` | Resolve a business term the user used to an actual field            |
| `dataSourceQuery`         | `SPECIFIED` | Fetch detail rows under a bounded filter, sort, limit               |
| `dataSourceCounting`      | `SPECIFIED` | Count rows in the same authorized scope as a detail query           |
| `dataQuery`               | `SPECIFIED` | Server-side count/sum/avg/min/max, with optional grouping           |
| `businessReportGenerator` | `SPECIFIED` | Assemble a validated Markdown report with inline charts             |
| `chartGenerator`          | `GENERAL`   | Render a chart from data the agent already has                      |
| `loadFrontendTool`        | `GENERAL`   | Read the manifest of browser tools the current page allows          |
| `executeFrontendTool`     | `GENERAL`   | Run one allowlisted browser tool by its exact id                    |
| `formFiller`              | `GENERAL`   | Fill a registered visible form; never submits or saves              |
| `suggestions`             | `GENERAL`   | Offer the user selectable follow-up prompts                         |
| `getSkill`                | `SPECIFIED` | Load a named Skill's instructions mid-conversation                  |
| `knowledge-base-retrieve` | `SPECIFIED` | Retrieve passages from the employee's bound knowledge base          |
| `subAgentWebSearch`       | `SPECIFIED` | Search the public web for current information                       |
| `list-ai-employees`       | `SPECIFIED` | Discover which specialists exist, for delegation                    |
| `get-ai-employee`         | `SPECIFIED` | Read one specialist's full profile before delegating                |
| `dispatch-sub-agent-task` | `SPECIFIED` | Hand a task to a specialist and get its answer back                 |

Three built-in Skills, all `GENERAL`, so every employee can load them: `data-metadata` (discover connections, collections, fields, relations), `data-query` (query records, counts, aggregates), `business-analysis-report` (build a report from freshly queried data).

Activate a `SPECIFIED` built-in by naming it in an employee's `tools` or a Skill's `tools`. Never import a built-in's implementation module.

## Making a collection visible to the data tools

The seven data tools and the two data Skills read nothing the App has not opted into, and the opt-in is not the collection itself. Three things must all hold for one collection, and all three are the App's to arrange:

1. It is registered for authorization under the **two-part** name `<connection>.<collection>` — `authz.db.collections.add({ name: 'main.orders', title: 'Orders' })`. A registration under a bare `orders` works for the rest of the application and is skipped here: the catalog keeps only names that split into exactly two dot-separated parts, and the first part must match a configured connection name exactly. There is no default-connection alias.
2. Its registration keeps the `read` action. The default action set includes it; a narrowed `actions` list can drop it.
3. The current user's permission set actually grants read on it, producing a conditional decision with fields and a scope.

Miss any of them and nothing raises. Discovery simply omits that collection, so the assistant answers "I could not find that table" while the table plainly exists and the application's own pages read it fine. A direct query against it is rejected instead of hidden, which is the faster way to tell the two apart.

Field visibility follows the same rule one level down: a query may touch only the intersection of registered fields, the authorization decision's output fields, and supported scalar metadata — so a field absent from the grant is missing rather than forbidden. Relations are one-hop and same-connection, and both sides are authorized independently.

So when a new business collection is meant to be queryable by an assistant, registering it for authorization is part of building it, not a later permissions chore. Verify it by asking the assistant to list collections before writing anything that depends on the answer.

## Three ways to reach outside the App

These are distinct and are chosen for different reasons; naming the wrong one gets a plausible answer with no evidence behind it.

| Mechanism                     | What happens                                                                       | Choose it when                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `webSearch` on the chat/state | The provider's own built-in search runs inside the main model call                 | The model provider supports it and the search is incidental  |
| `subAgentWebSearch` tool      | A separate provider call per query, run in parallel, results returned to the agent | Research is the task — several queries, results worth citing |
| An MCP server                 | Tools discovered from an external process or endpoint                              | The data lives in a specific system with its own protocol    |

`webSearch` is provider-dependent and is not universally available; `subAgentWebSearch` needs the conversation's model to be resolvable and is activated like any other `SPECIFIED` tool.

## LLM services (`config.yml`)

`ai.llmServices` is the authoritative set of service names. It is the only supported way to configure a service from source; there is no constructor argument for it.

```yaml
ai:
  llmServices:
    - name: gpt # required, unique; this is ModelRef.llmService
      title: GPT
      provider: openai # required, a registered provider key
      options:
        apiKey: ${OPENAI_API_KEY}
        # baseURL: https://gateway.internal/v1   # optional; overrides the provider default
      enabledModels: # optional; omit when the real model list is unknown
        - label: GPT-5.6
          value: gpt-5.6
      modelOptions:
        temperature: 0.2
      enabled: true
      sort: 10
```

`${NAME}` placeholders are expanded recursively **after** validation. A missing variable becomes an empty string, which typically surfaces as an authentication failure rather than a configuration error, so confirm the variable exists.

### Keys never go in source

Put the real value in `.env`, reference it as `${NAME}`, and before writing anything check that `.env` is ignored and not already tracked:

```bash
grep -n '^\.env' .gitignore ; git ls-files --error-unmatch .env 2>/dev/null && echo "TRACKED — stop"
```

Add the variable name, with no value, to `.env.example` so the next person knows it is needed. Tell the user plainly that the key stays out of the repository and out of any build artifact, and never put it in `config.yml.client`, which is served to the browser.

### Choose models from the provider, never from memory

`enabledModels[].value` is sent to the provider verbatim. NocoBase keeps no model catalog and validates nothing, so a model id recalled from memory fails only when someone tries to chat. At configuration time the application is not running, so there is no NocoBase API to ask — call the provider directly:

| `provider:`                    | Default base URL                                    | Model list request                                                    | Ids come from   |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| `openai`, `openai-completions` | `https://api.openai.com/v1`                         | `GET {base}/models`, `Authorization: Bearer <key>`                    | `data[].id`     |
| `deepseek`                     | `https://api.deepseek.com`                          | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `kimi`                         | `https://api.moonshot.cn/v1`                        | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `dashscope`                    | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `xai`                          | `https://api.x.ai/v1`                               | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `mimo`                         | `https://api.xiaomimimo.com/v1`                     | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `orcarouter`                   | `https://api.orcarouter.ai/v1`                      | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `shengsuanyun`                 | `https://router.shengsuanyun.com/api/v1`            | `GET {base}/models`, Bearer                                           | `data[].id`     |
| `mistral`                      | `https://api.mistral.ai`                            | `GET {base}/v1/models`, Bearer                                        | `data[].id`     |
| `anthropic`                    | `https://api.anthropic.com`                         | `GET {base}/v1/models`, `x-api-key` + `anthropic-version: 2023-06-01` | `data[].id`     |
| `google-genai`                 | `https://generativelanguage.googleapis.com`         | `GET {base}/v1beta/models?key=<key>` (no auth header)                 | `models[].name` |
| `ollama`                       | `http://localhost:11434`                            | `GET {base}/api/tags` (no key)                                        | `models[].name` |

`{base}` is `options.baseURL` when set, otherwise the default above; the request path is resolved against it with a trailing slash, so a base ending in `/v1` already contains that segment. Provider keys are case-sensitive. `openai` is the Responses API; use `openai-completions` for a gateway that only implements Chat Completions.

So, in order:

1. Fetch the list with the row above and pick from what comes back.
2. If the request fails or the key is not available yet, ask the user which models to enable.
3. If that is still unresolved, **omit `enabledModels` entirely** and say so. The service is then in provider-model mode and an administrator picks models in AI settings after start. An omitted list is correct; an invented one is a bug that surfaces as a failed chat.

Where the key is available, prove the configuration end to end with one small completion against a chosen model before declaring it done. A model list can succeed while the account has no access to the model that was picked.

`enabledModels` scopes what the model selector and `ai:listAllEnabledModels` offer, and which model is used when a caller names none. It is not an access boundary: a caller naming an unlisted model still runs.

On reload, the name set is authoritative — new names are created, existing names have their provider, title and connection updated, removed names are dropped. An administrator's `enabled` state and model list survive a reload. A duplicate name, a wrong field type, or an empty `name`/`provider` rejects the whole snapshot before anything is written.

## MCP servers (`config.yml`)

`ai.mcpServers` is the only way to configure MCP. The settings page is read-only: it enables a server and shows the tools it discovered, and it cannot create, edit, or delete a connection.

```yaml
ai:
  mcpServers:
    search: # the object key is the stable server name
      transport: http # stdio | http | sse
      url: ${SEARCH_MCP_URL}
      headers:
        Authorization: Bearer ${SEARCH_MCP_TOKEN}
    filesystem:
      transport: stdio
      command: npx
      args:
        [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '/srv/nocobase/shared',
        ]
      env:
        MCP_API_KEY: ${MCP_API_KEY}
```

`stdio` spawns a child process in the NocoBase server's environment — scope its command, working directory and file access to the minimum. `http` and `sse` take `url` and optional `headers`. `${NAME}` is expanded recursively here too.

Review every discovered tool's description and parameters before letting an employee use it, and keep anything that writes or has an external effect on `ASK`.

## Attachment storage (`config.yml`)

Enabling attachments on a chat surface lets the user select, drag, and paste files. They are stored on a NocoBase file-storage disk and referenced by metadata; the AI Employee plugin never writes a local path itself.

The disk is resolved in this order, and only the first valid entry of each list is used:

1. `ai.aiEmployee.storage.disk[0]`
2. `ai.storage.disk[0]`
3. the application's default drive disk (`drive.default`)

```yaml
ai:
  aiEmployee:
    storage:
      disk:
        - ai-files # must already exist in the App's file-storage configuration
```

Falling through to the application default is a real decision, not a neutral one: chat attachments can carry contracts, identity documents, or private correspondence, and they land wherever the App's general uploads land, under that disk's retention and access policy. **Raise this with the user and ask whether to configure a dedicated disk now**, before enabling attachments. State which disk the default resolves to, and what would then be sharing it.

What reaches the model, once stored: images and PDFs are sent as multimodal content blocks, so a dropped image is read directly with no extra tool. Other recognized document types are extracted to text by the document loader. Anything else produces a message telling the user that type is not supported. Whether an image is actually understood still depends on the provider and model.

## Extra Skill directories (`config.yml`)

```yaml
ai:
  skills:
    paths:
      - packages/shared-ai-skills/skills
```

Paths may be absolute or relative to the App root; they are trimmed and de-duplicated, and a missing directory is skipped. This affects Skill loading only — it does not discover employees or tools.

## Knowledge base

The plugin exposes the retrieval half: an employee bound to a knowledge base in AI settings can call the built-in `knowledge-base-retrieve` tool, which resolves the conversation's employee and returns matching passages.

Configuration lives under `ai.aiKnowledgeBase` in `config.yml` — `vectorDatabases[]` (each with a `key`, optional `name`, `provider`, and a `connection`), `manifests[]`, and its own `storage.disk`, which has multi-disk semantics that differ from the attachment rule above; do not infer one from the other. A vector database and an embedding service with working credentials must both exist before retrieval returns anything.

Do not treat a bound knowledge base as an authorization boundary for business data. Reading current business records is what the data tools are for.
