---
'@nocobase/app-plugin-ai-employee': patch
---

Hold the `nocobase-ai` Registry source to the standard of the application it is installed into

The Registry item is copied into an application's `client/extensions/`, where the application's Portal ESLint configuration lints it. This package excluded `registry/**` from its own lint, so nothing ever held that source to the rules it lands under: installing the AI frontend extension took a generated application from zero lint problems to 118 (91 errors, 27 warnings) across 34 files, and the application owner could only add an ignore for source they are told to review with a three-way merge. The exclusion is gone. `registry/**` is linted here with the same rules, typed through the `tsconfig.registry.json` the Registry typecheck already used, so the standard is now enforced where the code is written.

What the rules found was mostly real:

- Refs were written and read during render — a latest-value ref assigned in the render body, a lazily created chat controller, and a hovered page element read back out of the registry map while rendering. They are now assigned from effects, created with a lazy `useState` initializer, or held as state that the pointer handlers set.
- Effects called `setState` synchronously, cascading an extra render each time. State that mirrors an input is now adjusted while rendering as React documents, and loading flags are derived from what has been loaded rather than toggled: the conversation catalog, the report dialog's HTML tab, and the AI provider's configuration all follow from their inputs now. A queued AI employee task, which nothing renders, moved from state to a ref with a signal that wakes its effect.
- `String(value)` over an untyped server field renders `[object Object]` whenever the field is an object, which reached tool call ids, tool names, error text, attachment names, conversation session ids and the "AI employee not found" warning. A shared `toText` helper coerces only primitives and falls back otherwise.
- Promise-returning functions were passed to `onClick` and `onSubmit`, so a rejection became an unhandled rejection. Those handlers are named functions the props now call through `void`.
- List items keyed by array index are keyed by a stable discriminator.
- Several `() => unknown | Promise<unknown>` signatures already collapsed to `unknown`, because `unknown` absorbs every other member of a union. They are written as `() => unknown` with a comment stating that the result is awaited.

The module layout changed to satisfy Fast Refresh: a module that exports a component now exports only components, and its contexts, hooks and helpers live in a sibling module — `ai-context.ts`, `page-context-store.ts`, `page-context-utils.ts`, `form-registry.ts`, `frontend-tool-registry.ts`, `page-element-store.ts`, `tool-call-utils.ts`, `tool-renderer-context.ts`, `business-report-dialog-context.ts`, and the `badge-variants.ts`/`tabs-variants.ts` beside their shadcn components. Everything exported from `index.ts`, `providers/index.ts` and `components/index.ts` keeps its name and its module, so an application importing through them needs no change; an application that deep-imports a hook from a component module has to follow it to the sibling. An installed extension takes these as ordinary upstream changes in its next three-way merge.
