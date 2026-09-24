---
'@nocobase/app-plugin-ai-employee': patch
---

Let `createAgent()` take the checkpointer a paused run is kept in

`createAgent()` accepts an optional `checkpointer`, and `AgentServiceFactory` gains `getMemorySaver()` and `getDatabaseCheckpointSaver()` to build one without importing `@langchain/langgraph` directly. Without the option nothing changes: a fixed agent keeps its pauses in the plugin's tables under the default persistence, and in the process beside a persistence the caller supplies. `createAIEmployee()` takes no checkpointer, because the chat and the conversation center resume an employee's run from the plugin's tables.
