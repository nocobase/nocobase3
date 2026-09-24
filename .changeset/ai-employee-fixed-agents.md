---
'@nocobase/app-plugin-ai-employee': patch
---

Make a fixed agent follow its Skills and pause on a tool that asks

- **Skills reach the model.** `createAgent({ skills })` activated the tools those Skills name but never gave the model the Skills themselves. A fixed agent given Skills now gets `getSkill`, bound to exactly those Skills, and its system prompt lists them the way an employee's does.
- **A tool that asks pauses.** `createAgent()` ran every tool straight away, so a tool declaring `defaultPermission: 'ASK'` — or declaring nothing, which means the same — skipped review in the one kind of agent with nobody watching. It now runs unattended only when it declares `ALLOW`; otherwise the run pauses, `invoke()` reports `interrupt`, and `resumeInvoke()` continues it, as for an employee.
- **Where a pause is kept.** A fixed agent keeps its pauses in the plugin's own checkpoint tables under the default persistence, so a newly created agent for the same session can resume them, and in the process beside a persistence the caller supplies. `createAgent()` accepts a `checkpointer` to choose otherwise, and `AgentServiceFactory` provides `getMemorySaver()` and `getDatabaseCheckpointSaver()` to build one without importing `@langchain/langgraph`. `createAIEmployee()` takes none: the chat and the conversation center resume an employee's run from the plugin's tables.
