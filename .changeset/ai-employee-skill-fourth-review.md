---
'@nocobase/app-plugin-ai-employee': patch
---

Correct the Skill where a reviewer walked it against the source and it did not hold

An independent review built an application by following the Skill and checking each claim against the code rather than the Skill. Two of its findings were things an agent would have written and shipped without noticing, and both came from the same blind spot: the Skill described the function it pointed at, not what the layer below that function does with the result.

**Web search was described backwards.** The Skill presented `webSearch` and `subAgentWebSearch` as two mechanisms, the first being "the provider's own built-in search inside the main model call". It is not a mechanism at all — it adds the same `subAgentWebSearch` tool to the conversation, and both depend on the provider having built-in search, which only six of the thirteen providers do. The section now describes one tool with two switches, points at the provider capability table, and names the refusal an agent will see on a provider that cannot search.

**`enabledModels` was described as if `config.yml` were authoritative.** It is applied when a service row is first created and ignored on every reload after that, so a corrected model id never takes effect and a service first created without a list stays at zero usable models. The Skill said the opposite of what mattered by stating only that an administrator's list survives a reload. It now states the consequence, drops the advice to omit the list as a soft fallback, and documents the new per-service `overrideEnabledModels`.

The rest are contracts the Skill got wrong, each verified against the code:

- A tool named by **any** registered Skill stops being a base tool for every employee until that Skill is loaded — so listing it in `tools` is not enough, and the seven data tools are in this position.
- `autoCall` is read only for `CUSTOM` tools, where it overrides `ASK` rather than respecting it, and is ignored everywhere else.
- `AIPageContextScope` must be an ancestor of the chat, not of the element it describes; the example wrapped the wrong subtree and would have sent an empty context in silence.
- `useAIForm` returns only a ref, so a form reaches the conversation through a reference the App builds and scopes around the chat.
- A chat without `defaultEmployee` opens on the lowest-`sort` employee, which is the built-in `atlas`.
- The plugin is registered in `server/plugins.ts` and `client/plugins.ts`; `package.json#nocobase` has no plugin list.
- Knowledge-base retrieval is gated on a feature another plugin enables, so the decision table's knowledge-base row is unreachable without it.
- An unregistered `provider:` key drops the whole service silently.
- Provider capabilities differ for PDFs and for web search, and a new table records which.
- The data tools have hard capacity limits, and `applyReactHookFormValues` is imported from the adapter path rather than the extension root.

A known gap is now stated rather than left to be discovered after deployment: a built server does not read the application's `.env`. It is an open defect with a fix planned, and the Skill says so — an application cannot close it itself, but it should not be designed as though it were permanent either. A second, an application's `ai/skills` never reaching its `dist/`, is fixed in `@nocobase/app-tools` in this same release, and the Skill describes the build carrying them instead.

Separately, the built-in catalog is now an inventory rather than a list. All nineteen tools appear in six families with their scope, permission and execution side; all three Skills appear with the tools each one names and what its procedure is actually for; and a section in front of both explains how the two relate — that a Skill implements nothing, that a tool named by any Skill leaves every employee's base set until that Skill is loaded, and that this is what makes the choice between an employee's `tools` and a Skill's `tools` a real one rather than a matter of taste.

The section on reaching business data also stops teaching another plugin's API. Registering a collection for authorization and granting read on it belong to the `nocobase-app-plugin-authorization` Skill, and the AI Skill's own `description` already hands permissions back — so explaining `authz.db.collections.add` here contradicted its boundary and put a second, differently-worded tutorial beside the authoritative one. What stays is the part no other Skill can know: these tools read only resource ids shaped `<connection>.<collection>`, that id is the application-wide one rather than a private key, and everything unreachable is invisible rather than refused.

That two-part requirement is now pinned by a test, and the test is the reason the description sharpened. Registering a collection under a bare name leaves discovery empty — not the table missing, the *connection* missing, so `getDataSources` returns nothing and the assistant reports having no data sources at all. Whoever debugs that looks at the database configuration rather than the grant. The repository had no case for a bare name, which is how a constraint this consequential stayed invisible.

`server-runs.md` also gains what an agent driven with nobody watching has to get right: `invoke()` rather than `stream()`, the surrounding system's own `AbortSignal`, and a decision about interrupts made before one happens. The reliable arrangement is not to pause at all — a background run activates only tools that run automatically. When a pause is genuinely needed, `invoke()` reports it as `interrupt` on its result, and a caller that resumes is deciding on the user's behalf, so it decides per action rather than approving whatever is pending; the actions name each tool call, and its arguments are read from the returned `message`. A conversation left paused is not reused for a new turn, since `invoke()` does not clear pending calls the way the chat route does.

The error contract is written down for the first time, because retrying is the caller's decision and it needs the code to make it. Two codes carry `retryable: true` — a recursion limit and an empty stream, both worth another attempt because a model is not deterministic — and everything else defaults to `false` and fails the same way twice. Two more codes are declared and mapped to HTTP statuses but never raised from the agent path, which is worth knowing before waiting for them.

The employee example no longer lists `create-order` and `dataSourceQuery` in `tools`. The first is named by the example's own `order-intake` Skill and the second by the built-in `data-query` Skill, so under the gating rule the same reference explains, both entries did nothing — and the second carried an `autoCall` that is ignored for a `SPECIFIED` tool. The example now declares only its Skill and says why.
