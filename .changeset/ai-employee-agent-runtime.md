---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Group what the host lends an execution into AgentRuntime

`AgentContext` held `logger`, `translate` and `getHeader` beside `actor`, `state` and `deps`, as if the four were the same kind of thing. They are not: `actor` and `state` say what the execution is, `deps` is what the tool asked for, and those three are only what the host lends it for as long as it runs.

They are now `AgentRuntime`, reached as `ctx.runtime`. `CreateAgentContextOptions` takes the same object rather than the three fields loose, so a caller assembles the runtime once instead of threading `logger` through every construction site beside the state.

A tool reading `ctx.logger`, `ctx.translate` or `ctx.getHeader` reads `ctx.runtime.logger` and so on. One building an `AgentContext` by hand supplies `runtime` in place of the three.
