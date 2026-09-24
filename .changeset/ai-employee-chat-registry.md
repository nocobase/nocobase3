---
'@nocobase/app-plugin-ai-employee': patch
---

Fix the `nocobase-ai` chat Registry item, and hold it to an application's lint rules

Installed copies of the `nocobase-ai` Registry item get these changes by updating it.

- **Lint.** Installing the item took a generated application from no lint problems to 118, because this package never linted the Registry source with the rules it lands under. It does now, and what the rules found is fixed: refs written or read during render, effects that set state synchronously, `String(value)` over untyped server fields rendering `[object Object]`, promises passed to event handlers, and list items keyed by index. A module that exports a component now exports only components, with its contexts, hooks and helpers in a sibling module such as `ai-context.ts` or `page-context-utils.ts`. Everything exported from `index.ts`, `providers/index.ts` and `components/index.ts` keeps its name; code that deep-imported a hook from a component module follows it to the sibling.
- **A chat mounted before the configuration loaded** dropped every message without an error. Its stored employee now follows the one the chat resolves, and a send reads the current configuration.
- **A floating chat opens on the chat's `defaultEmployee`.** `AIChatFloatingTrigger` without `aiEmployee` leaves the choice to the chat instead of opening the first employee, and `AIChatProvider` falls back to `defaultEmployee` when its initial selection cannot be found. `AIEmployeeTaskTrigger.aiEmployee` is optional.
- **A form in a message's context no longer hides the employee's tools.** The chat sent `skillSettings: { tools: ['formFiller'] }` when no task named any tools, which the server reads as an allowlist and stores on the conversation, so for the rest of that conversation the employee could use only `formFiller` and the system tools. The chat now adds `formFiller` only to a task's own tool list.
