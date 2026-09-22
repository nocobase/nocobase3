---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Type the model an agent resolved to, and check it where every other request field is checked

`AgentState.model` was `Record<string, unknown>`. It has been since the v3 migration commit that introduced the type, and nothing chose it: `ModelRef` lives in `@nocobase/app-plugin-ai-employee`, so the library had no name for the shape it was carrying. The looseness bought nothing. Its only writer puts a resolved model there, and both readers narrowed it straight back out with a type guard the plugin had to keep.

It is `{ llmService: string; model: string }` now, which is what it always held, and the guard is gone with its two call sites.

That guard was covering for something else, though. `parseTurn` checks the type of every field it takes off the request except this one, which passed `input.model` through untouched — so `AgentState.model` promised every tool a resolved reference while carrying whatever the client had sent. The check now happens there, with the rest: a model missing either half is dropped rather than carried, and the two fields the state holds are the two that survive.

A consumer reading `AgentState.model` no longer needs to narrow it. One writing an arbitrary object there has to write a model reference instead.
