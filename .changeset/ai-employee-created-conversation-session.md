---
'@nocobase/app-plugin-ai-employee': patch
---

Type a created conversation's `sessionId` as always present

`AIConversationsManager.create()` now resolves to `CreatedAIConversation`, whose `sessionId` is a `string` rather than optional, so passing `state: { sessionId: conversation.sessionId }` to `createAIEmployee()` compiles under strict mode without an assertion. The type is exported from `@nocobase/app-plugin-ai-employee/server`. The call fails instead of resolving if storage ever returns a conversation without a `sessionId`.
