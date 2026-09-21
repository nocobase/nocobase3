---
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/ai-employee': patch
---

Let a tool declare the services it needs, and narrow the agent context to this execution

A backend tool received the whole `AgentContext` and reached into it for whatever it wanted. Nothing was declared, and two problems followed from that. A tool outside this package could not ask for an application service at all: the default route builds the tool context itself, `CreateEmployeeOptions` has no injection seam, and `services` was a fixed set — so the only way to give a tool a dependency was to close over it at plugin bootstrap. And `ctx.database` handed every tool a full `DatabaseManager`, with `repository()`, `query()`, `builder()` and `destroy()`, scoped by nothing. No tool used it; it was simply reachable.

A tool now declares container tokens and receives them resolved:

```ts
export default defineTools({
  definition: { name: 'lookup-invoice', description: '...', schema },
  dependencies: { billing: billingServiceToken },
  invoke: async (ctx, args) => ({
    status: 'success',
    content: await ctx.deps.billing.findInvoice(args.id, ctx.actor.id),
  }),
});
```

Nothing new registers them — these are tokens of the application's own container. `TDeps` is inferred from `dependencies`, so `ctx.deps` is typed from the tokens without repeating their service types. `AgentService` resolves each tool's declaration into that tool's own context, so a tool reaches neither what another tool declared nor anything undeclared, and a token the container cannot resolve fails the execution naming the tool and the token instead of surfacing as an undefined property later.

`AgentContext` is now this execution and nothing ambient: `deps`, `actor`, `state`, `logger`, `translate`, `getHeader` and `availableSkills`. `ai`, `database`, `repositories` and `services` are gone, and the `<TRepositories, TServices>` generics collapse to `<TDeps>`. The seven `AppAgentServices` wrappers, which mostly forwarded one method each to a manager, are deleted with them: the built-in tools declare `managerFactoryToken`, `repositoryFactoryToken` or `aiManagerToken` and call those managers directly. The data tools declare `dataServicesFactoryToken` and build their reader with `ctx.actor`, so they reach collections only through an authorized, read-only capability — no tool declares the database.

A tool is also bound to its context when it is built rather than reading it back out of the invocation config, so an `agentContext` key on a request now reaches nothing and is not forwarded.

A tool outside this repository that read `ctx.ai`, `ctx.database`, `ctx.repositories` or `ctx.services` declares the matching token in `dependencies` and reads it from `ctx.deps`. `buildTool(entity)` takes the bound context as its second argument.
