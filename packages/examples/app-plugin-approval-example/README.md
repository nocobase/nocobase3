# @nocobase/app-plugin-approval-example

Shows approvals built on `@nocobase/app-plugin-approval` and `@nocobase/lifecycle`: 28 approval scenarios as business applications on the application's own database. Each business record is a plain lifecycle that waits in one state while an approval run decides; the run's stages, every person's task and the approval log live in the approval plugin's collections, and the answer that ends a run moves the record in the same transaction.

Everything runs under **Approvals** in the application menu:

| Page                     | What it shows                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| To-do center             | Everything that waits for the person you act as, across every business — decisions, pools to take from, opinions and material asked of them, copies, notices to confirm, and the work a record needs — with what they did and what they started |
| Leave, Business trips, … | One page per business: start a request with its route previewed before it is sent, follow your own, handle the ones waiting for you. A request opens with its content, its approval flow, what you may do now, and its history                  |
| Approval lab             | Every scenario with its technical detail: load samples, start any scenario, run the clock, change the organization and the simulated providers as the administrator, and look under the hood of each record                                     |

The identity at the top of every page is a demo persona shared by all pages and kept in the browser, not a user account. A real application takes the actor from the signed-in user and authorizes every read.

## Try it

Run the examples application with `pnpm --filter @nocobase/app-template-examples dev`, sign in, and open **Approvals**.

1. **A leave request.** On **Leave**, as Zhang San, start a request; the preview shows who will decide. Switch to Li Si with the chip at the top and approve it from the list: the request moves once, and an effect registers it with HR.
2. **Returns and revisions.** On **Contracts**, start a contract review. As legal, revise the terms; as finance, return it to the applicant; resubmit it, and see which earlier decisions it kept.
3. **A parallel purchase.** On **Purchasing**, start a parallel purchase with a server and software: IT and security each review a child request of their own, and the purchase completes when both approve.
4. **The outside world.** In the **Approval lab**, as the administrator, take the payment provider down, then pay an approved payment request and watch the retries; bring it back and retry the run from **Under the hood**.
5. **The organization.** In the lab, as the administrator, make Zhao Min Zhang San's manager or switch the versioned leave rules to v2, and preview a new leave request.

## How it is wired

| Concern                      | Where                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The businesses               | `server/scenarios/`, one module per family of scenarios: each declares its record's lifecycle and the approval it waits on with `defineApproval()`                                                                                 |
| What the lab runs            | `server/lab/catalog.ts`: the organization, every lifecycle and approval, their parameters, and how each request form becomes a record. `shared/catalog.ts` lists the requests a person can start and the businesses they belong to |
| Records and their tables     | `database/migrations/`, one collection per business with exactly the fields its lifecycle writes, the lifecycle log, and the lab's simulated messages, external calls and settings                                                 |
| Runs, tasks and the log      | `@nocobase/app-plugin-approval`'s own collections, created by its migration                                                                                                                                                        |
| Effects, triggers, the clock | `createLifecycleJobs()`: effects as jobs, and a sweep every ten seconds that runs the triggers and `ApprovalExampleService.sweep()` — reminders, escalations, claim timeouts, scheduled payments, expiring grants and orders       |
| Routes                       | `server/routes/index.ts`: the pages' reads and the approval layer's operations under `/approval-example`, and the library's standard record routes beneath it for transitions and effect runs                                      |
| Pages                        | `client/center/` for the approval center, `client/lab/` for the lab                                                                                                                                                                |

`server/lab/center.ts` is a read model: it summarizes every record for its business, derives each person's to-do center from the task table, the notices' acknowledgements and the business transitions waiting for them, and previews the route of a new request from the same definitions and organization that will decide it. Every action goes through `ApprovalExampleService`, the approval layer or the lifecycle's routes, so the page offers only what their rules allow.

This is an inspectable demonstration, not an approval product: any signed-in user can act as any persona and read every record, the organization lives in the lab's settings rather than in user, department and role tables, external providers are simulated in the database, and the read model scans whole collections where an application would page through indexed queries.

## Testing

`tests/scenarios/` runs the 28 scenarios on memory storage and a fake clock, one file per family, against the approval layer's service. `tests/lab.test.ts` applies both migrations to SQLite and walks every business through its main path with the service the routes call — records, runs, tasks, effects and simulated providers all in the database. `tests/routes.test.ts` covers the HTTP boundary, `tests/provider.test.ts` the real provider on the memory jobs service, and `tests/client/` renders the approval center and the lab against the real routes.

```bash
pnpm --filter @nocobase/app-plugin-approval-example lint
pnpm --filter @nocobase/app-plugin-approval-example typecheck
pnpm --filter @nocobase/app-plugin-approval-example test
pnpm --filter @nocobase/app-plugin-approval-example build
```
