---
'@nocobase/app-plugin-ai-employee': patch
---

Read the agent's state off its context rather than through a second accessor

`AgentContextProvider.state()` returned `agentContext.state` and existed only because `agentContext` used to be `unknown`: a caller that wanted the state could not reach it. Now that the property is typed, the accessor is a second way to the same value, so it is gone and its three callers read `agentContext.state` directly.

`tests/agent-tool-runtime-context.test.ts` is `agent-tool-context.test.ts`, named for what it covers.

An `AgentContextProvider` implemented outside this package drops its `state()` method.
