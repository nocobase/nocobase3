---
'@nocobase/app-plugin-ai-employee': patch
---

Drop the AppAgentContext alias

`export type AppAgentContext = AgentContext` carried no type information. `AgentContext<TDeps = Record<string, never>>` already defaults its one parameter, so the alias was exactly the type it aliased, and a reader meeting both names in one file had to check whether they differed. It read like a seam for application-specific fields, but that seam was never real: a context is built by `createAgentContext()` and handed to a tool as `AgentContext`, so a field declared only on the alias would not exist at runtime. The form that does carry meaning here is the parameterized one, as `AgentContext<SubAgentDeps>` in `server/ai/sub-agents/shared.ts` shows; the zero-dependency case needs no name of its own.

The alias is gone and every use is `AgentContext` from `@nocobase/ai-employee`. Its comment moves to `createAgentContext()`, which is what actually establishes the rule it described. A caller importing `AppAgentContext` from this package imports `AgentContext` from `@nocobase/ai-employee` instead.

The boundary test that guarded this now asserts the boundary rather than the name: `server/agent/context.ts` must not import from `hono`, and must take its context type from the library. It previously asserted only that the file contained the string `AppAgentContext`, which a rename would have broken and which proved nothing about what a tool receives.
