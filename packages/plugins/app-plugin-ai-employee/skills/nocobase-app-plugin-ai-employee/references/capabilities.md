# AI Capabilities an App Defines

What an App can add to the AI Employee runtime, what is already there, and the `config.yml` block that turns it on. Every shape here is the current public contract; keep names and enum values exact, and treat "optional" as "may be omitted", never as "may be `null`" — the one exception is an employee's `systemPrompt`, which is `string | null`.

## Table of contents

- [Where each resource is registered](#where-each-resource-is-registered)
- [Employees](#employees)
- [Avatars](#avatars)
- [Backend tools](#backend-tools)
- [Writing business data from a tool](#writing-business-data-from-a-tool)
- [Skills](#skills)
- [Tool and Skill display i18n](#tool-and-skill-display-i18n)
- [How Skills and Tools relate](#how-skills-and-tools-relate)
- [Built-in Skills](#built-in-skills)
- [Built-in Tools](#built-in-tools)
- [Built-in employee](#built-in-employee)
- [What the data tools can see](#what-the-data-tools-can-see)
- [Reaching outside the App](#reaching-outside-the-app)
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

Registration runs in one fixed order: tools, skills, employees, with the MCP connections rebuilt afterwards. That order is not why a name resolves, though — names are looked up at execution time, so an employee may name a tool or skill registered anywhere, including one the plugin registers before the App's own Provider runs.

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
  // `order-intake` names `create-order`, so the tool activates when that Skill is loaded;
  // listing it in `tools` as well would do nothing. Reading orders needs no entry either —
  // the built-in `data-query` Skill is GENERAL. Use `tools` only for a tool no Skill names.
  skills: ['order-intake'],
  chatSettings: {
    systemPromptMode: 'default',
    enableSkills: true,
    enableTools: true,
  },
});
```

`AIEmployeeOptions` is exactly: `username`, `category?`, `description?`, `skills?`, `tools?`, `chatSettings?`, `avatar?`, `nickname?`, `position?`, `bio?`, `greeting?`, `systemPrompt?`, `sort?`. Nothing else is accepted. In particular there is no `knowledgeBase` field and no `prompt.md` convention: the prompt is the `systemPrompt` string, and knowledge-base binding is a settings-page decision on the persisted employee.

`username` is the identity everything else uses — chat requests, `AIEmployeeShortcut.aiEmployee`, tasks, sub-agent dispatch, stored conversations. Changing it after users have conversations orphans them.

`tools[].name` must match a registered tool name exactly.

`autoCall` is narrower than it reads, and in one case it does the opposite of what it sounds like. The runtime consults it only for `CUSTOM` tools; for `SPECIFIED` and `GENERAL` it is ignored entirely and automatic calling follows `defaultPermission === 'ALLOW'`. On a `CUSTOM` tool listed here, `autoCall` replaces `defaultPermission` altogether: `autoCall: true` makes the call automatic, overriding an `ASK` default rather than respecting it, and leaving `autoCall` out makes it ask, even when the tool declares `ALLOW`. So a `CUSTOM` tool listed in `tools` states `autoCall` either way. A value the definition sets is also written to the employee record the first time the employee is registered, and a stored `true` or `false` wins over whatever the definition says afterwards — once one is stored, changing `autoCall` in code does not change a deployed employee; the administrator changes it in AI settings.

`skills` and `tools` are the employee's declared capability set, but listing a tool is not always enough to reach it: a tool named by any registered Skill stays behind that Skill until the conversation loads it. Read [How Skills and Tools relate](#how-skills-and-tools-relate) before deciding which of the two lists a capability belongs in — the choice is not cosmetic, and the failure mode is a tool that never activates and never complains.

The persisted employee record carries more than the definition does — `enabled`, `builtIn`, `deprecated`, `about`, `defaultPrompt`, `skillSettings`, `knowledgeBase`, model settings. Those are administered in AI settings. Do not put them in the definition.

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
import { orderServiceToken } from '../../providers/index.js';

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

`dependencies` is the only way in. Each token is resolved from the **App container**, so an App tool declares the App's own service tokens — the same ones the App's routes use, registered by a provider under `server/providers/` and exported from `server/providers/index.ts`. A token the container cannot resolve fails the execution with an error naming the tool and the token, rather than surfacing as an undefined property halfway through.

`ctx.actor` is the authorization identity. A model can put anything in its arguments, including a user id; never treat an argument as authorization.

## Writing business data from a tool

A tool that writes owns three things the runtime will not do for it.

**Authorize.** The check belongs in the tool, against `ctx.actor`, not in the prompt and not in the schema, and not as `ctx.actor.roles.includes('admin')`. Prefer declaring an App service token that already enforces the App's rules over declaring a raw database handle: the built-in data tools do exactly this, resolving an actor-bound service and passing `ctx.actor` into it, so no read reaches a collection unauthorized.

An App service usually authorizes through the request scope the authorization middleware installs, and a tool call has no request. The service the tool declares builds the same scope from the actor instead, with the same subjects the middleware would add — `authenticated:*`, and every membership the authorization service resolves for the user:

```ts
import { authorizationToken } from '@nocobase/app-plugin-authorization';

// Inside the App service the tool declares; `authz` is resolved from authorizationToken.
const principal = { type: 'user', id: String(actor.id) };
const scope = authz.for({
  principal,
  subjects: [
    { type: 'authenticated', id: '*' },
    ...(await authz.subjects.resolveFor(principal)),
  ],
});
const decision = await scope.authorize({
  resource: { type: 'resource', id: 'sales.orders' },
  action: 'create',
});
```

Leaving out `resolveFor` is the easy mistake: the check still runs, but anything granted to a team or another membership is denied. What to do with the decision — rejecting a denial, binding `decision.conditions.database` to the write with `repository.withPolicy()` — belongs to the `nocobase-app-plugin-authorization` Skill.

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

**An employee Skill is one file.** Loading it with `getSkill` hands the model the body of `SKILL.md` and nothing else, and the model has no tool that reads a file, so a link to `references/contracts.md` is a link it cannot follow. This is not the layout of an agent Skill such as this one: put everything the procedure needs into the `SKILL.md` body, and keep any `references/` pages for the people maintaining it.

`tools` names tools that are **already registered in code**. A Skill directory defines no tool. The loader does scan a `tools/` subdirectory, but it only takes filenames from it and appends them to this same list of names, so a source file placed there without a matching registration in `server/ai/tools/` contributes a dead name that resolves to nothing. The build copies only Markdown, so those names exist in development and are gone from a built server — and where one does match a registered tool, the Skill gates that tool in development and not in production. Keep tool source under `server/ai/tools/` and name every tool in the frontmatter.

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

## How Skills and Tools relate

They are two halves of one capability and neither works alone.

A **Tool** is code — an argument schema plus an `invoke` — and it is the only thing that can act. A **Skill** is Markdown: a procedure, plus a `tools` list naming tools that already exist. A Skill implements nothing and cannot define a tool.

Four properties decide whether a given tool is reachable in a given turn:

| Property            | Decides                   | Values                                                                              |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `scope`             | who may reach it at all   | `GENERAL` every employee, `SPECIFIED` only when named, `CUSTOM` supplied per caller |
| named by a Skill    | when it becomes reachable | gated behind that Skill being loaded, for everyone                                  |
| `defaultPermission` | whether the user confirms | `ALLOW` runs, `ASK` asks; defaults to `ASK` when the tool declares none             |
| `execution`         | where `invoke` runs       | `backend` in the server, `frontend` in the browser; defaults to `backend`           |

The second row is the one that surprises people. A tool named by **any** registered Skill leaves every employee's base set and comes back only for a conversation that has loaded that Skill, through `getSkill`. So a Skill is not merely documentation attached to tools — it is the gate in front of them, and putting a tool in a Skill takes it away from employees that only list it.

That gating is deliberate: it keeps a large tool catalog out of the model's context until a procedure needs it, and it means the model reads the procedure and gains the tools in the same step. It also means three things when composing:

- Bare `tools` on an employee suits a tool no Skill names — a single action with no procedure around it.
- A Skill suits a set of tools used together in a known order, where the order matters as much as the tools.
- Naming a tool in a Skill **and** expecting a different employee to reach it through `tools` alone does not work, and reports nothing.

`getSkill` is exempt from its own rule, so it is always reachable and is what opens every other gate.

## Built-in Skills

Three, all `GENERAL`, so any employee can load any of them without being granted anything. They chain: a report loads the query Skill, which loads the metadata Skill.

| Skill                      | What the procedure is for                                                                                     | Tools it names                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `data-metadata`            | Find the connection, collection and fields behind a business question before querying anything                | `getDataSources`, `getCollectionNames`, `getCollectionMetadata`, `searchFieldMetadata` |
| `data-query`               | Answer factual questions about current records — details, counts, aggregates, grouped summaries               | `dataSourceQuery`, `dataSourceCounting`, `dataQuery`                                   |
| `business-analysis-report` | Turn freshly queried data into a validated Markdown report with optional inline charts, with its caveats kept | `businessReportGenerator`, `getSkill`                                                  |

Each body carries more than the tool list: `data-query` documents the supported filter, sort, pagination and grouping shape and the precision rules; `data-metadata` forbids probing around a denial; `business-analysis-report` requires checking the generator's `errors`/`warnings` before claiming a report was produced. That prose is the reason to reuse these rather than write equivalents.

**These three account for all seven data tools plus `businessReportGenerator`.** Listing `dataSourceQuery` in an employee's `tools` therefore does not make it callable on the first turn; the model must load `data-query` first. Plan for that round trip, or accept that it depends on the model choosing to load the Skill.

## Built-in Tools

Nineteen, in six families. All are `backend` unless the table says otherwise, and none should ever be imported — activate them by name.

**Data (7)** — `SPECIFIED`, `ALLOW`, gated behind `data-metadata` / `data-query`. Every one reads through an actor-bound service, so the current user's permissions apply, including those inherited through a team or another membership, and all are bounded (see the capacity limits below).

| Tool                    | What it does                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `getDataSources`        | List the authorized named database connections                                        |
| `getCollectionNames`    | List the collections the current user may read in one connection                      |
| `getCollectionMetadata` | Read one collection's accessible fields and queryable relations                       |
| `searchFieldMetadata`   | Resolve a business term to a real field, marking exact matches apart from candidates  |
| `dataSourceQuery`       | Fetch detail rows under a flat AND filter, explicit fields, sort, limit, offset       |
| `dataSourceCounting`    | Count rows in the same authorized scope as a detail query                             |
| `dataQuery`             | Server-side count/sum/avg/min/max, with optional grouping over declared value domains |

**Reporting (2)**

| Tool                      | Scope       | Permission | What it does                                                                          |
| ------------------------- | ----------- | ---------- | ------------------------------------------------------------------------------------- |
| `businessReportGenerator` | `SPECIFIED` | `ALLOW`    | Validate and prepare a Markdown report for preview and export; gated behind its Skill |
| `chartGenerator`          | `GENERAL`   | `ALLOW`    | Produce ECharts options from data the agent already holds; no Skill gates it          |

**Browser (3)** — `GENERAL`, `ALLOW`, `execution: 'frontend'`. These run in the page and need the chat's page context. On an agent driven from server code a call to one pauses the run, whatever its permission, because only a browser can carry it out — see [server-runs.md § Running unattended](server-runs.md#running-unattended).

| Tool                  | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `formFiller`          | Write values into a registered visible form. Never submits and never saves |
| `loadFrontendTool`    | Read the input schema of one browser tool the current page offers          |
| `executeFrontendTool` | Run one allowlisted browser tool by its exact `${contextId}:${name}` id    |

**Conversation (2)**

| Tool          | Scope       | Permission | What it does                                                                                         |
| ------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `getSkill`    | `SPECIFIED` | `ALLOW`    | Load a Skill's content and activate its tools for this conversation. Exempt from Skill gating        |
| `suggestions` | `GENERAL`   | `ASK`      | Offer selectable follow-up prompts. The `ASK` is the interaction: the user's pick is the tool result |

**Knowledge and web (2)**

| Tool                      | Scope       | Permission | What it does                                                                                       |
| ------------------------- | ----------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `knowledge-base-retrieve` | `SPECIFIED` | `ALLOW`    | Retrieve passages from the conversation employee's bound knowledge base. Needs the feature enabled |
| `subAgentWebSearch`       | `SPECIFIED` | `ALLOW`    | Search the web, one provider call per query in parallel. Refuses when the provider cannot search   |

**Sub-agents (3)** — `SPECIFIED`, `ALLOW`. Delegation between employees. They see enabled, non-deprecated employees in the `business` category.

| Tool                      | What it does                                                           |
| ------------------------- | ---------------------------------------------------------------------- |
| `list-ai-employees`       | Lightweight profiles of the employees available for delegation         |
| `get-ai-employee`         | One employee's full profile, before deciding to delegate               |
| `dispatch-sub-agent-task` | Hand a task to another employee; returns its sub-session id and answer |

## Built-in employee

One: `atlas`, `sort: 0`. It is a router — it analyses a request, decides whether it can answer directly, and delegates to a specialist only when one is materially better suited, through the three sub-agent tools. Use it as-is; do not copy its definition into the App to modify it.

Its `sort: 0` has a practical consequence: employees are ordered by the user's own sort, then `sort`, so an App employee whose `sort` is omitted or `0` ties with it and the tie falls to storage order. A chat without `defaultEmployee` can therefore open on `atlas`.

## What the data tools can see

The seven data tools and the two data Skills read nothing an application has not opted into, and the opt-in is authorization: a collection is reachable only through a registered authorization resource the current user is granted read on. **Registering and granting is not this plugin's to explain** — it belongs to the `nocobase-app-plugin-authorization` Skill, and to `nocobase-app-development` for where that work sits in an application. Go there for the API, the grants, and the permission sets.

What this plugin adds on top is one constraint and one failure mode. Both are its own, and neither is written down anywhere else.

### The resource id must be `<connection>.<collection>`

These tools read the authorization catalog and keep only resource ids that split into exactly two dot-separated parts, with the first part matching a configured connection name. A resource registered under a bare `orders` is skipped; `main.orders` is seen. There is no default-connection alias, and this is deliberate rather than an oversight: these tools address a collection as `{ dataSource, collection }`, and a flat catalog of bare names cannot say which connection an `orders` belongs to. Note the asymmetry, because it is easy to assume otherwise — a _query_ does default `dataSource` to `main`, but a _registration_ is never assumed to mean it.

That id is not this plugin's private key — it is the same id the rest of an application already uses in its permission declarations, route guards and role grants, and the authorization Skill's examples use the bare form. So this is a naming decision for the whole application, taken once:

- Renaming an existing resource to the two-part form means renaming it everywhere it is referenced, or the application's own pages and APIs break.
- Registering both names produces two independent resources that grant separately, so a user granted one still cannot read through the other.

Decide it while there is nothing to migrate. If an application already uses bare names, that is a conversation with the user, not a silent rename.

### Missing means invisible, not refused

Discovery hides what it cannot reach. A collection that is unregistered, registered under a bare name, missing the `read` action, or simply not granted to this user is absent from the catalog with nothing logged. Worse than a missing table: **the connection disappears with it**, so `getDataSources` comes back empty and the assistant reports having no data sources at all rather than being unable to find one table — which sends whoever is debugging it toward the database configuration instead of the grant. A direct query naming that collection is rejected rather than hidden, but with the same message whether it is unregistered, registered without `read`, or not granted, so the error confirms the collection is unreachable without saying why; check the registration and the grant in turn. Only a field left out of the grant gets a message of its own.

The same rule applies one level down: a query may touch only the intersection of registered fields, the authorization decision's output fields, and supported scalar metadata, so a field left out of a grant is missing rather than forbidden. Relations are one-hop and same-connection, and each side is authorized independently.

So when a new business collection is meant to be queryable by an assistant, arranging its authorization is part of building it rather than a later chore — and the check is to ask the assistant to list collections before writing anything that depends on the answer.

### Hard limits

These bounds fail rather than truncate. More than 1,000 registered authorization resources fails the whole catalog with an error; a collection with more than 500 fields is hidden entirely; detail queries take 1–50 explicit fields, at most 30 flat AND conditions and 8 sort keys, with limit 1–100 and offset up to 10,000; grouped aggregates need explicit value domains bounded to 100 combinations. An application whose model is larger than this needs a tool of its own rather than a larger request.

## Reaching outside the App

There are two mechanisms, not three, and the difference between them is smaller than it looks.

**Web search is one tool with two switches.** `webSearch: true` — on `AIChatProvider`, on a task, or in the agent state — does not make the main model call search. All it does is add the `subAgentWebSearch` tool to this conversation. The other switch is listing `subAgentWebSearch` in an employee's `tools`. Either way the same tool runs: one separate provider call per query, in parallel, results returned to the agent.

**Both depend on the provider having built-in search**, because that is the only searching that happens anywhere. The tool asks its provider for a model with search enabled; a provider that does not implement it ignores the request without error. See the [capability table](#what-each-provider-can-actually-do) for which providers do — and note that `openai-completions`, the key a gateway normally uses, is not one of them.

On a provider that cannot search, the tool returns `status: 'error'` saying no search ran. That refusal is deliberate. Without it the request still reached a model, and a model given a retrieval prompt produces findings and a source list from training data; the answer looks researched and cites URLs that were never fetched. If an App needs search on such a provider, give it an MCP search server instead.

**An MCP server** is the other mechanism: tools discovered from an external process or endpoint, for data that lives in a specific system with its own protocol. It is also the answer when the provider cannot search and the model cannot be changed.

## LLM services (`config.yml`)

`ai.llmServices` is the authoritative set of service names. It is the only way to create, remove, or reconfigure a service; there is no constructor argument or API for it. AI settings can only switch a configured service on or off and choose its models.

```yaml
ai:
  llmServices:
    - name: gpt # required, unique; this is ModelRef.llmService
      title: GPT
      provider: openai # required, a registered provider key
      options:
        apiKey: ${OPENAI_API_KEY}
        # baseURL: https://gateway.internal/v1   # optional; overrides the provider default
      enabledModels: # applied when the service row is created; see below
        - label: GPT-5.6
          value: gpt-5.6
      overrideEnabledModels: false # optional, default false; see below
      modelOptions:
        temperature: 0.2
      enabled: true
      sort: 10
```

`${NAME}` placeholders are expanded recursively **after** validation, from `process.env`. A missing variable becomes an empty string, which typically surfaces as an authentication failure rather than a configuration error, so confirm the variable exists — see [Where the key lives](#where-the-key-lives).

### Where the key lives

Settle this with the user before writing any configuration. The goal is fixed: the key never enters the repository, never reaches a commit, and never enters the conversation transcript. Never ask the user to paste a key into the conversation and never write one yourself. Hand the user a command that prompts for the key, and have them run it in their own terminal rather than through the agent, since a command the agent runs carries the key into its transcript.

Your own shell may already hold the key. An agent's shell usually starts from the user's profile, so a variable the user set before this session is in its environment, and printing it prints the key. Never run anything that prints the environment or a variable's value — listing the environment, tracing executed commands, echoing the variable, verbose HTTP output against a provider (`google-genai` takes its key in the query string) — and never print a shell profile, `.env`, or a `config.yml` that holds a value. When you need to know whether a variable exists, use a test that reports only set or missing.

Offer the three places in this order, say why they rank this way, and let the user choose:

| Option          | Where the key is                                                | `config.yml` holds          | Works in                                                                                                  |
| --------------- | --------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1 — recommended | a system environment variable                                   | `apiKey: ${OPENAI_API_KEY}` | development and a built server, the same way                                                              |
| 2               | `config.yml` itself, once it is confirmed ignored and untracked | the key's value             | development and a built server, but the agent sees the key every time it edits the file                   |
| 3 — last resort | `.env`                                                          | `apiKey: ${OPENAI_API_KEY}` | **`pnpm dev` only** in this version — see [SKILL.md § Known gaps](../SKILL.md#known-gaps-in-this-version) |

Whichever is chosen, first confirm with git that each file involved — `config.yml`, and `.env` for option 3 — is both ignored and untracked, and stop if either is not. `config.example.yml` is committed, so it always carries `${OPENAI_API_KEY}` and never a value, whichever option the App uses. A key never goes under `config.yml`'s `client:` block, which is served to the browser.

#### Build the command for the user's environment

There is no one right command. Which file sets a variable, how it is reloaded, and what syntax writes it depend on the user's operating system, their shell, how that shell is started, and where the server actually runs. Work those out before writing anything, and do not assume the environment you happen to be running in:

- **Establish the environment from facts that are not secret** — the operating system, the user's login shell, which startup files exist and whether they are symbolic links — without reading any file's contents. Then confirm with the user, because the terminal they will run the command in can differ from yours: another shell, a remote host, a container, WSL.
- **Find where the server takes its environment from.** A server started from the user's terminal inherits that shell's environment, so the right file is the one that shell reads for the way it is started, which is not always the obvious one. A server started by a service manager, a container runtime, a process manager or a development container reads none of the user's shell files, and the variable belongs in that system's configuration instead.
- **Prefer the mechanism the environment already has** for a persistent variable, such as a shell's own command for one or the operating system's user environment, over editing a file.

Whatever the environment, the command you hand over must:

- read the key from a hidden prompt when it runs — the shell's silent read, or a secure-string prompt — rather than carry it in the command, so the key never appears on screen, in the command line, or in the shell history;
- read it exactly as typed, including leading and trailing spaces and backslashes, which a shell's read strips or interprets unless told not to;
- write nothing when the user cancels the prompt;
- create what it writes to if it does not exist yet, and not leave a new file readable by other users; an existing file keeps its permissions, so tell the user to tighten one that others can read;
- replace an earlier entry for the same variable rather than add a second, so running it twice leaves one, and keep everything else in the file;
- write through a file that is a symbolic link rather than replacing the link;
- write the value so that the target's own parser reads back exactly what was typed: quoted by that shell's rules in a shell profile; in YAML, as a single-quoted scalar with each `'` doubled; in this App's `.env`, single-quoted, with `\$` for each `$` that is followed by `{`, a letter or `_`, since `$NAME` and `${NAME}` are expanded even inside quotes — any other `$` stays as typed;
- refuse a value its target cannot hold, and say where it can go instead. `.env` turns `\n` and `\r` into line breaks inside quotes and has no way to write them literally, so a key containing a backslash followed by `n` or `r` cannot be stored there. The plugin expands `${NAME}` in `ai.llmServices` and `ai.mcpServers` values after YAML is parsed, with no escape, so a key containing `${` followed by a letter or `_` and a closing `}` cannot be written into `config.yml`. Option 1 holds both;
- call commands by name without depending on the user's aliases or functions;
- print nothing of the value.

Before handing it over, run it yourself against a throwaway copy of the target, in the same shell when it is available to you, and read the value back with the target's own parser — never with the real key. Use fake values that together contain both quotes, `$NAME`, `${1}`, a trailing `$`, a backslash, a backtick, and leading and trailing spaces; for `.env` also one with a literal `\n`, and for `config.yml` one with `${NAME}`, each of which the command must refuse. Run it once against a symbolic link and once where the file does not exist yet. If you cannot verify a command for the user's environment, give them the manual edit instead: the line to add in an editor, or on Windows the account's environment variables dialog.

Then give the user a check to run in a new terminal that reports whether the variable is set without printing it. A variable set during this session is in neither the agent's shell nor any process already running — including a `pnpm dev` the agent starts, which then expands `${OPENAI_API_KEY}` to an empty string. Either the user starts the server from their own terminal, or the agent session is restarted from a terminal that has the variable.

**Option 2 — the value in `config.yml`.** Offer it only after git confirms `config.yml` is ignored and untracked, and only when the user accepts what it costs: the key is then in a file this Skill edits for `ai.mcpServers`, `ai.aiEmployee.storage`, `ai.skills.paths` and every later service change, and an agent reads a file before editing it, so the key enters the transcript each time. That is why this ranks second. Write the entry with a marker in place of the key, inside single quotes so that the replacement follows YAML's single-quoted rules — `apiKey: 'REPLACE_WITH_OPENAI_API_KEY'` — and give the user a command for their environment that replaces the marker with the value literally and fails, changing nothing, when the marker is not there; build and verify it the same way. Many in-place editing tools write a new file and rename it over the old one, which replaces a symbolic link with a regular file; write through the link instead. Where no suitable tool is available, the replacement is an edit in an editor.

**Option 3 — `.env`.** Offer it only after git confirms `.env` is ignored and untracked, and only when the user accepts that it works under `pnpm dev` alone. `pnpm dev` merges `.env` into the server's environment; a built server does not, so under `pnpm start` or in a deployment the placeholder expands to an empty string. Say that to the user rather than leaving it to be found on the server. `.env` also has the lowest precedence of the three places `pnpm dev` reads: `.env.local` overrides it, and a variable already in the environment `pnpm dev` starts from overrides both. So before using it, have the user check — without printing a value — that neither their terminal nor `.env.local` already sets `OPENAI_API_KEY`, or the value written to `.env` is silently ignored. If the App has a `.env.example`, add the variable name to it with no value. Then give them a command for their environment that sets `OPENAI_API_KEY=<value>` in `.env` with the same properties as option 1's.

**A change takes effect on restart.** The server reads its environment, `config.yml` and `.env` when it starts, so after setting a variable, editing `config.yml`, or editing `.env`, restart it. `pnpm dev` restarts itself when `config.yml` or `.env` changes, and that restart reads both files again — but it keeps the environment `pnpm dev` was started with, so it never picks up a system variable set since. For option 1, stop `pnpm dev` completely and start it again from a terminal that has the variable.

**Deployment is configured separately.** A deployment keeps its own `config.yml` beside `dist/`; `pnpm build` ships `dist/` and `config.example.yml`, never `config.yml`. It does write a `dist/.env`, but only for an allowlist of the framework's own keys — database, mail, cache — and an LLM key is not one of them, so an AI key never reaches a deployment that way. Tell the user to check two things before the first start there:

- the deployment's `config.yml` has the `ai.llmServices` entry — it is not copied from the development machine;
- with option 1, the variable is set where the service manager starts the process — the service unit, the process manager's configuration, the container's environment. A service reads no user's shell profile, so a variable that works in the user's terminal can still be missing from the service.

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

`{base}` is `options.baseURL` when set, otherwise the default above; the request path is resolved against it with a trailing slash, so a base ending in `/v1` already contains that segment. Provider keys are case-sensitive, and an unregistered one is dropped in silence: validation only checks that `provider` is a non-empty string, so a typo removes the whole service from the model list with nothing in the logs. `openai` is the Responses API; use `openai-completions` for a gateway that only implements Chat Completions.

### What each provider can actually do

Two capabilities vary by provider and neither is visible from the configuration. Pick the provider against this table when a feature depends on one.

| `provider:`                                 | How a PDF is sent                          | Built-in web search |
| ------------------------------------------- | ------------------------------------------ | ------------------- |
| `openai`                                    | as a document                              | yes                 |
| `anthropic`, `google-genai`                 | as a document                              | yes                 |
| `dashscope`, `mimo`                         | text-extracted                             | yes                 |
| `deepseek`                                  | text-extracted                             | three models only   |
| `openai-completions`, `xai`, `shengsuanyun` | as a document, if the endpoint accepts one | **no**              |
| `ollama`                                    | text-extracted                             | **no**              |
| `kimi`, `mistral`, `orcarouter`             | text-extracted                             | **no**              |

Every provider in the list sends images to the model. The PDF column says what the plugin sends, not what the far end does with it. "as a document" means a content block the model sees as a document — a `file` block on the OpenAI-shaped providers, a base64 `document` block on `anthropic`, and a block typed by MIME type on `google-genai`; "text-extracted" means the PDF goes through the document loader and arrives as text — usually fine, but layout and figures are lost. `openai-completions`, `xai` and `shengsuanyun` speak to whatever endpoint the service points at, so whether a `file` block is accepted is that endpoint's decision; one that rejects it fails the whole turn with `PROVIDER_ERROR` rather than falling back to text, so try a PDF against the real endpoint before relying on it. `deepseek` supports web search only on the models its own capability table marks, and rejects the rest with a clear error rather than silently.

Web search is the one to check first, because there is no capability check anywhere else: only the composer's web search toggle reads `AIModel.supportWebSearch` — see [chat-surfaces.md § Web search toggle](chat-surfaces.md#web-search-toggle) — so web search switched on through `AIChatProvider.webSearch`, a task, or the agent state looks identical on a provider that cannot search. The `subAgentWebSearch` tool refuses on those providers rather than answering from memory, which is what makes the gap visible at all.

So, in order:

1. Fetch the list with the row above and pick from what comes back.
2. If the request fails or the key is not available yet, ask the user which models to enable.
3. If that is still unresolved, leave `enabledModels` out **and tell the user the service has no usable model until someone picks one in AI settings**. Omitting it is not a soft default: the list normalizes to an empty provider-mode list, an empty list drops the service out of `ai:listAllEnabledModels` altogether, and the application then has a configured service and nothing to chat with. An omitted list is honest; an invented one is a bug that surfaces as a failed chat.

Where the key is available, prove the configuration end to end with one small completion against a chosen model before declaring it done. Both requests reference the key by variable name, as in `-H "Authorization: Bearer $OPENAI_API_KEY"`, and never by value; when the agent's shell does not have the variable, or the key lives in `config.yml`, give the user the request to run instead. A model list can succeed while the account has no access to the model that was picked.

### `enabledModels` applies once, unless you say otherwise

`enabledModels` scopes what the model selector and `ai:listAllEnabledModels` offer, and which model is used when a caller names none. It is not an access boundary: a caller naming an unlisted model still runs.

On every load the name set is authoritative — new names are created, existing names have their provider, title, `options`, `modelOptions` and `sort` rewritten from `config.yml`, removed names are dropped. Rewritten means replaced, not merged: a service whose entry leaves out `options` gets `{}`, and one that leaves out `modelOptions` gets the defaults (`temperature: 1`, `topP: 1`, both penalties `0`), overwriting whatever was tuned in AI settings. So an entry that exists in `config.yml` states those fields in full, or accepts the defaults. **The model list and the enable switch are not updated.** They are treated as an administrator's, so for a service that already exists the values in the database win and `config.yml` is ignored. That is right when the list is curated in AI settings, and surprising in every other case:

- a model id written wrongly the first time cannot be corrected from `config.yml`;
- a service first created without `enabledModels` stays at zero models no matter what is added later;
- neither situation reports anything.

`overrideEnabledModels: true` on a service reapplies its configured list on every load. It is per service, optional, and defaults to `false`, so nothing changes unless it is set. Turning it on means the list lives in `config.yml` and edits made in AI settings are overwritten on the next load — say that to the user rather than letting them find out. The switch governs the model list alone: a service an administrator disabled stays disabled, even when its entry says `enabled: true`.

It is also how an App keeps the chat's default model under source control. The selector lists every enabled service's models ordered by service `sort` then name, and the chat opens on the first one, so the service `sort` — rewritten on every load — picks the service, and the first entry of its `enabledModels` picks the model. That first entry comes from `config.yml` when the service is created, and afterwards only while `overrideEnabledModels` is on; otherwise it is whatever the database holds. An employee with its own model settings in AI settings overrides all of this for its chats: the selector offers only those of that employee's models that are currently enabled, in the order the employee lists them, opens on the first, and the server runs no other. When none of them is enabled — its service switched off, or the model removed from the service's list — the chat offers no model and cannot send, and the server refuses to create an agent for that employee — a `CONFIGURATION_ERROR` reading `None of the models this AI employee may use is enabled` — rather than falling back to another model.

A duplicate name, a wrong field type, an empty `name`/`provider`, or a non-boolean `overrideEnabledModels` rejects the whole snapshot before anything is written.

## MCP servers (`config.yml`)

`ai.mcpServers` is the only way to configure MCP. The settings page enables or disables a server, shows the tools it discovered, and sets each tool's permission; it cannot create, edit, or delete a connection. Both the enable switch and the tool permissions are stored in the database and survive a restart: `enabled` in `config.yml` applies when a server is first created, and after that the switch is the administrator's, as it is for LLM services.

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

Put a credential in `headers` for `http` and `sse`, or in `env` for `stdio` — never in `url` or `args`. The settings API masks header and environment values whose names look secret, such as `Authorization`, `token` or `api_key`, but returns `url` and `args` as written, so a token in a query string reaches every administrator who opens the page. Every expanded value, masked or not, is stored in plain text on the server's row in the `aiMcpClients` table, so it is also in every backup of that database; give an MCP server a credential scoped to what its tools need.

The client is built at start and whenever a server is switched on or off in AI settings. A server that cannot be reached then is skipped with a warning in the server log naming it, and the application runs without its tools; the others connect as usual. Nothing retries in between, so after bringing an unreachable server back, switch it off and on in AI settings or restart. A missing MCP tool in the chat is a reason to read the log, not a sign the configuration was ignored.

A server's tools register as `GENERAL` tools named `mcp-<server>-<tool>`, so every employee whose tool selection has never been saved has them from the moment the server connects. Once an employee's tool switches are saved in AI settings, that selection is a fixed list, and a tool discovered afterwards — a new MCP tool included — stays off for that employee until someone switches it on. Use that exact name wherever a tool is named: in a Skill's `tools`, an employee's `tools`, or a session's `skillSettings`. Narrowing them for one employee is its tool selection in AI settings, or a session's `skillSettings` allowlist.

A tool whose server-side name starts with `get` defaults to `ALLOW`, and every other tool to `ASK`; the settings page, or `aiMcpServers:updateToolPermission`, changes that per tool. The default is a guess from the name, not from what the tool does, so review each discovered tool's description and parameters, and keep anything that writes or has an external effect on `ASK` — including a `get…` tool that turns out to have one. A permission can be set only for a tool its connected server lists; for any other name the action answers `404` and keeps nothing.

The switch and the tool permissions belong to the server's name. Removing a server from `config.yml` deletes its row, and renaming it is a removal plus a new server, so either one discards what an administrator set: the server comes back with `enabled` from `config.yml` and every tool on its name-based default.

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

Falling through to the application default is a real decision, not a neutral one: chat attachments can carry contracts, identity documents, or private correspondence, and they land wherever the App's general uploads land, under that disk's retention and access policy. **Raise this with the user and ask whether to configure a dedicated disk now**, when you enable attachments. State which disk the default resolves to, and what would then be sharing it.

What reaches the model, once stored: images are sent as content blocks, so a dropped image is read directly with no extra tool; a PDF is sent as a document or as extracted text depending on the provider — see [What each provider can actually do](#what-each-provider-can-actually-do). Other recognized document types are extracted to text by the document loader. Anything else produces a message telling the user that type is not supported. Whether an image is actually understood still depends on the provider and model.

## Extra Skill directories (`config.yml`)

```yaml
ai:
  skills:
    paths:
      - packages/shared-ai-skills/skills
```

Paths may be absolute or relative to the App root; they are trimmed and de-duplicated, and a missing directory is skipped with a warning, `AI Skill directory does not exist; skipping`; only the App's own `ai/skills` is skipped quietly. This affects Skill loading only — it does not discover employees or tools.

The App root is not the same directory in both places. In development it is the source root; a built server runs from `dist/`, so a relative path resolves inside `dist/`, where the build has copied nothing, and the directory is skipped with that warning. The build copies only the App's own `ai/skills`. For a deployment, list an absolute path the deployment itself provides.

## Knowledge base

**Check first that the feature is available.** Retrieval is gated on a knowledge-base feature flag that this plugin never turns on by itself; a separate plugin enables it. Without that plugin `knowledge-base-retrieve` returns nothing for every employee, whatever the settings page shows — so in an application that does not have it, a knowledge base is not the answer to "ground the assistant in our documents", and saying so early is better than wiring one up. Where the plugin is installed, follow its own Skill for vector databases, embedding services and ingestion; the rest of this section is only the part this plugin owns.

The plugin exposes the retrieval half: an employee bound to a knowledge base in AI settings can call the built-in `knowledge-base-retrieve` tool, which resolves the conversation's employee and returns matching passages.

Configuration lives under `ai.aiKnowledgeBase` in `config.yml` — `vectorDatabases[]` (each with a `key` and a `connection`, and optional `name`, `provider`, `databaseSpec` and `enabled`), `manifests[]`, and its own `storage.disk`, which has multi-disk semantics that differ from the attachment rule above; do not infer one from the other. A vector database and an embedding service with working credentials must both exist before retrieval returns anything.

Do not treat a bound knowledge base as an authorization boundary for business data. Reading current business records is what the data tools are for.
