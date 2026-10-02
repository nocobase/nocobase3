# @nocobase/app-plugin-lifecycle-example

Shows record lifecycles built on `@nocobase/lifecycle`: a business record keeps its state in one of its own fields, every change is a transition declared in source, and the side effects a transition owes run after it commits, with retries. There is no separate process instance — where a ticket or an expense stands is its `status`.

Two lifecycles run under **Lifecycle Example** in the application menu, each behind a page that reads like the product rather than like the lifecycle:

| Page            | Lifecycle                      | What it shows                                                                                                                                                                                                                                   |
| --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Help desk       | `server/lifecycles/ticket.ts`  | A customer files a ticket; agents take it from a queue and reply; a ticket left waiting on the customer closes itself, a customer reply brings it back, and a closed ticket can be reopened for a week. The conversation is the transition log  |
| Expense reports | `server/lifecycles/expense.ts` | An employee claims itemized expenses; the amount decides whether it is approved automatically or needs the manager and finance; approvers approve, send back or reject with a reason; an idle manager is passed over; payment runs as an effect |

Each page has a **Signed in as** switch over the example's people — agents and customers, or employees, managers, an executive and the finance director — so one person can play every role; a real application takes the actor from the signed-in user and authorizes the action. The waits are minutes rather than days so you can watch a trigger fire, and a demo option on each new record makes its first email deliveries or payment attempts fail on purpose, to show retries. Under each record, **Under the hood** shows its states, parameters, transition log and effect runs.

## How it is wired

| Concern                     | Where                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| States and transitions      | `server/lifecycles/*.ts`, the only definition of each flow                                                                                                                                                                            |
| Effects                     | `server/lifecycles/*.effects.ts`, plain functions                                                                                                                                                                                     |
| Records and the log         | `database/migrations/`, through the Repository store                                                                                                                                                                                  |
| Effects, triggers, recovery | `createLifecycleJobs()` from `@nocobase/lifecycle/jobs`: a `JobExecutor` job per effect run, a `ScheduleExecutor` sweep every 10 seconds that reclaims expired attempts, fires triggers and prunes old runs, and `recover()` on start |
| Record routes               | `createLifecycleRoutes()` from `@nocobase/lifecycle/hono`, mounted at `/lifecycle-example/lifecycles`                                                                                                                                 |
| Record pages                | `useLifecycle()` from `@nocobase/lifecycle/react`, with the API client as transport                                                                                                                                                   |

## Testing

`tests/lifecycles.test.ts` tests both lifecycles with `@nocobase/lifecycle/testing`: a memory store, a fake clock and in-process effects, so waiting, escalating and retrying are plain function calls. `tests/provider.test.ts` runs the real Provider against SQLite and the memory jobs service, and `tests/routes.test.ts` covers the HTTP boundary.

```bash
pnpm --filter @nocobase/app-plugin-lifecycle-example lint
pnpm --filter @nocobase/app-plugin-lifecycle-example typecheck
pnpm --filter @nocobase/app-plugin-lifecycle-example test
pnpm --filter @nocobase/app-plugin-lifecycle-example build
```
