---
"@nocobase/lifecycle": minor
"@nocobase/app-plugin-lifecycle-example": patch
"@nocobase/app-plugin-office-flows-example": patch
---

Let a second layer of state run while a record waits in a state, such as the tasks of an approval stage or a conversation with an assistant. `runtime.transaction(work)` runs one transaction across every registered lifecycle: `tx.fire()` and `tx.create()` check what `fire()` and `create()` check, `tx.read()` reads through the transaction store, `tx.handle` writes rows of the caller's own, and `tx.afterCommit()` schedules a best-effort callback; events, effects and callbacks follow the commit and none of them happen on a rollback, and each lifecycle call uses a savepoint, so a caught refusal undoes only that call. `onEnterState` and `onLeaveState` declare hooks that run in the transaction of every transition entering or leaving a state, `runtime.create()` included, a self-transition running both; they and `onTransition` receive the transaction as `tx`. A state definition may carry its own `onEnterState` and `onLeaveState`, which run before the lifecycle's for that state, so a module can provide a whole state for a business to list. A transition declared `manual: false` is fired only by server code: `fire()` refuses human actions marked with `manual: true` with `NOT_MANUAL`, `available()` leaves it out, `can()` refuses it with a `manual` blocker, `announce` skips it and `toMermaid()` marks it. The memory store keeps field-level rollback and explicit `within` transaction nesting, and adds `records()` to list a collection's rows.

Add two second layers written by hand to the example plugin, each keeping its rounds in rows of its own while a record waits in one state: a visa whose applicant and officer exchange material in rounds, and an order whose assistant asks the planner to choose before it re-plans. Neither moves the record until it concludes, and a late answer for a stay that has already ended is refused.

Mark human actions in the lifecycle and office-flow example routes so system-only transitions cannot be fired through those endpoints.
