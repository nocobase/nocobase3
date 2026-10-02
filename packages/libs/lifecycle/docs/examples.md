# Examples

Business scenarios as short lifecycle recipes: a sentence on the need, the code, and what the library does and does not take care of. Start with the [guide](guide.md#quick-start-a-leave-request) for a complete plugin; use this page to pick a pattern before writing its types, migration, provider and page. The [concepts](concepts.md) explain the vocabulary and the [design](design.md) the transaction and recovery guarantees.

The snippets are TypeScript-shaped pseudocode, not complete plugins. Unless one calls `defineLifecycle`, it shows entries to put inside `transitions`, `onEnter` or `triggers` as labelled; imports, type arguments and the surrounding states are left out, and every state and effect named must be declared in the full definition. `applicantOnly`, `approverOnly`, `systemOnly` and `services.*` are application code: a guard such as `systemOnly` is `({ actor }) => actor.system === true || { code: 'systemOnly', message: '…' }`, and the services are whatever the plugin registers. Authentication and authorization belong on the application's routes in every scenario.

| Business need                                                                        | Pattern                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [Route by amount](#1-route-by-amount)                                                | One action with several destinations                    |
| [Approve through several levels](#2-approve-through-several-levels)                  | A shared action, a route and a computed approver        |
| [Hand over, escalate, reassign](#3-hand-over-escalate-reassign)                      | Self-transitions                                        |
| [Withdraw or reopen](#4-withdraw-or-reopen)                                          | Many source states and a time-window guard              |
| [Expire an idle request](#5-expire-an-idle-request)                                  | A system transition and a trigger                       |
| [Freeze a rule at submission](#6-freeze-a-rule-at-submission)                        | Parameters copied onto the record                       |
| [A background process in steps](#7-a-background-process-in-steps)                    | Effects chained through continuations                   |
| [Pay and continue](#8-pay-and-continue-after-the-external-call)                      | An effect with retries, `onSuccess` and `onFailure`     |
| [Confirm by webhook](#9-confirm-by-webhook)                                          | A system transition keyed by the sender's event id      |
| [Write related data with the transition](#10-write-related-data-with-the-transition) | A transaction-bound service in `onTransition`           |
| [Wait for every signer](#11-wait-for-every-signer)                                   | A self-transition until the last decision               |
| [Wait for child tasks](#12-wait-for-child-tasks)                                     | Lifecycles joined by a foreign key                      |
| [Dispatch sub-records repeatedly](#13-dispatch-sub-records-repeatedly)               | A self-transition whose effect writes under unique keys |
| [Add a rule from another plugin](#14-add-a-rule-from-another-plugin)                 | An extra guard with explicit cleanup                    |
| [A to-do list from announce](#15-a-to-do-list-from-announce)                         | Best-effort listeners                                   |
| [Duplicate requests and stale pages](#16-duplicate-requests-and-stale-pages)         | Request identity and the expected version               |
| [A data fix as a transition](#17-a-data-fix-as-a-transition)                         | A system-only transition fired by a script              |
| [Permissions on the standard routes](#18-permissions-on-the-standard-routes)         | `authorize` mapped to permissions                       |
| [Testing waits, retries and refusals](#19-testing-waits-retries-and-refusals)        | The test kit                                            |

## 1. Route by amount

An expense under a configured limit is approved at once; a larger one waits for a manager. The person clicks the same Submit button either way.

```ts
// parameters
{ autoApproveLimitCents: 500_000 }

// transitions
submit: {
  from: 'draft',
  to: ['approved', 'awaitingManager'],
  guard: applicantOnly,
  route: ({ record, parameters }) =>
    record.amountCents <= parameters.autoApproveLimitCents
      ? 'approved'
      : 'awaitingManager',
  set: ({ to, now }) => ({
    approvedAt: to === 'approved' ? now.toISOString() : null,
  }),
},

// onEnter
approved: [requestPayment],
```

`route` must return one of the declared `to` values, or the transition is refused with `INVALID_ROUTE`. It reads the record as it was before this transition's writes, so an amount arriving in this action's `input` has to be validated and read from the input explicitly. `onEnter` starts the payment whichever way `approved` was reached — this route, or a manager's later decision.

## 2. Approve through several levels

A request passes a manager and then finance. One `approve` action covers every stage; `route` picks the next stage from the current state and `set` moves the approver.

```ts
const NEXT = { awaitingManager: 'awaitingFinance', awaitingFinance: 'approved' };

// transitions
approve: {
  title: 'Approve',
  from: ['awaitingManager', 'awaitingFinance'],
  to: ['awaitingFinance', 'approved'],
  guard: ({ record, actor }) =>
    actor.id === record.approverId || {
      code: 'approverOnly',
      message: 'Only the current approver can decide.',
    },
  route: ({ record }) => NEXT[record.status],
  set: ({ record, to, services }) => ({
    approverId: to === 'approved' ? null : services.org.approverFor(to, record),
  }),
},
returnToApplicant: {
  from: ['awaitingManager', 'awaitingFinance'],
  to: 'draft',
  guard: approverOnly,
  validate: (input) =>
    input.reason ? null : [{ field: 'reason', message: 'Give a reason.' }],
  accept: ['reason'],
  set: () => ({ approverId: null }),
},

// onEnter
awaitingFinance: [notifyApprover],
approved: [notifyApplicant],
```

The same guard and the same button serve every level, and the log shows each decision with its level as `from` and `to`. The library supplies no organization chart, delegation policy or permission model: keep the approver on the record or resolve it through the plugin's services.

## 3. Hand over, escalate, reassign

A transition whose `from` equals its `to` changes fields without changing the stage. It still increments the version, writes a log entry and updates `statusChangedAt`, so a trigger starts its wait again.

```ts
// transitions
transfer: {
  title: 'Hand over',
  from: 'awaitingManager',
  to: 'awaitingManager',
  guard: approverOnly,
  validate: (input) =>
    typeof input.to === 'string' && input.to
      ? null
      : [{ field: 'to', message: 'Choose who takes it.' }],
  set: async ({ input, services }) => {
    await services.org.requireApprover(input.to); // reads through the transaction
    return { approverId: input.to };
  },
  effects: [notifyApprover],
},
escalate: {
  from: 'awaitingManager',
  to: 'awaitingManager',
  guard: ({ record, actor, services }) => {
    if (actor.system !== true)
      return { code: 'systemOnly', message: 'Escalation is automatic.' };
    return services.org.managerOf(record.approverId) !== undefined || {
      code: 'topApprover',
      message: 'The current approver is already the highest level.',
    };
  },
  set: ({ record, services }) => ({
    approverId: services.org.managerOf(record.approverId),
  }),
},

// triggers
escalateStale: {
  transition: 'escalate',
  when: 'awaitingManager',
  after: ({ escalateAfterDays }) => escalateAfterDays * 86_400_000,
},
```

Entering a state again runs its `onEnter` effects, so a notification that belongs only to the hand-over goes on the transition's own `effects`, as above, rather than on `onEnter.awaitingManager`. A service that `set` reads must be bound to the transaction (see [the guide](guide.md#read-other-tables-from-a-guard)). A record whose guard refuses the trigger — one already at the top approver — is passed over by the sweep and does not hold up the records behind it.

## 4. Withdraw or reopen

A request may be withdrawn from any stage under way; a closed ticket may be reopened by its customer for seven days.

```ts
// request transitions
withdraw: {
  title: 'Withdraw',
  from: { except: ['draft', 'approved'] }, // every non-final state but these
  to: 'draft',
  guard: applicantOnly,
  set: () => ({ approverId: null }),
},

// ticket transitions, in another lifecycle
reopen: {
  from: 'closed',
  to: 'open',
  guard: ({ record, actor, now }) => {
    if (actor.id !== record.customerId)
      return { code: 'customerOnly', message: 'Only the customer can reopen.' };
    return (
      now.getTime() - Date.parse(record.statusChangedAt) < 7 * 86_400_000 || {
        code: 'reopenExpired',
        message: 'The ticket closed too long ago to reopen.',
      }
    );
  },
},
```

`except` and `'*'` cover non-final states only, so a reopenable `closed` is not marked `final`. They also pick up every state added later; list the source states by name when adding a stage should force a deliberate decision about withdrawal. The window above counts from the last transition; if other self-transitions in `closed` must not extend it, write a `closedAt` field in `set` and compare with that.

## 5. Expire an idle request

A pending request expires after 72 hours of nobody acting on it.

```ts
// parameters
{ expireAfterHours: 72 }

// transitions
expire: {
  from: 'pending',
  to: 'expired', // a final state
  guard: systemOnly,
  effects: [notifyApplicant],
},

// triggers
expireStale: {
  transition: 'expire',
  when: 'pending',
  after: ({ expireAfterHours }) => expireAfterHours * 3_600_000,
  batchSize: 100, // transitions fired per sweep
},
```

Sweeps run only when something calls `runTriggers()`; `createLifecycleJobs()` schedules them. A record expires on the first sweep after the threshold, not at an exact instant, so the sweep interval bounds the delay. The wait counts from the last transition, self-transitions included. `after` receives the parameters, not the record, so a fixed deadline such as an invoice's `dueAt` is not a trigger: select the due records in application code and `fire()` the transition for each, as the system.

## 6. Freeze a rule at submission

Parameters are read when a transition fires, so a limit an administrator changes applies to records still on their way. To judge a record by the rule in force when it was submitted, copy the rule onto the record and read it back from there.

```ts
submit: {
  from: 'draft',
  to: ['approved', 'awaitingManager'],
  route: ({ record, parameters }) =>
    record.amountCents <= parameters.autoApproveLimitCents
      ? 'approved'
      : 'awaitingManager',
  set: ({ parameters }) => ({
    autoApproveLimitAtSubmit: parameters.autoApproveLimitCents,
  }),
},
// Later transitions and effects read record.autoApproveLimitAtSubmit.
```

The same applies to effects: an effect reads the record when its attempt starts, not as it was when the transition fired. Payment terms that must not change while a payment is pending are either kept immutable in those states or captured onto the record by the transition that starts the payment.

## 7. A background process in steps

An order reserves stock, then ships, and goes to backorder when the reservation fails. Each intermediate state names the step under way, and each step is an effect that fires the next transition when it finishes.

```ts
const reserveStock = defineEffect({
  name: 'orders.reserveStock',
  retry: { attempts: 3, backoffMs: 5_000, factor: 2 },
  onSuccess: 'reserved', // fired as the system with the result as input
  onFailure: 'backordered', // fired as the system with { error } as input
  run: ({ record, idempotencyKey, services }) =>
    services.inventory.reserve(record.items, { idempotencyKey }),
});

const createShipment = defineEffect({
  name: 'orders.createShipment',
  retry: { attempts: 5, backoffMs: 10_000 },
  onSuccess: 'shipped',
  run: ({ record, idempotencyKey, services }) =>
    services.carrier.book(record.address, { idempotencyKey }),
});

// transitions
submit:       { from: 'draft',     to: 'reserving', guard: clerkOnly,  effects: [reserveStock] },
reserved:     { from: 'reserving', to: 'shipping',  guard: systemOnly, effects: [createShipment] },
backordered:  { from: 'reserving', to: 'backorder', guard: systemOnly, accept: ['error'] },
shipped:      { from: 'shipping',  to: 'done',      guard: systemOnly, accept: ['trackingNumber'] },
retryReserve: { from: 'backorder', to: 'reserving', guard: clerkOnly,  effects: [reserveStock] },
```

A process that stops between steps leaves the record in `reserving` or `shipping` with a queued run, which `recover()` on start or `reclaim()` on the sweep runs again under the same idempotency key. `accept` copies `trackingNumber` from the effect's result onto the record. The continuations are guarded to the system so a person cannot click them.

## 8. Pay and continue after the external call

Approval starts a payment after commit. A successful payment writes its reference through another transition; exhausted retries move the report to a state a person looks at.

```ts
const requestPayment = defineEffect({
  name: 'expenses.requestPayment',
  retry: { attempts: 3, backoffMs: 2_000, factor: 2 },
  timeoutMs: 10_000, // below the runtime's leaseMs
  onSuccess: 'paid',
  onFailure: 'paymentFailed',
  run: async ({ record, services, idempotencyKey, signal }) => {
    const payment = await services.payments.pay({
      amountCents: record.amountCents,
      recipientId: record.applicantId,
      idempotencyKey,
      signal,
    });
    return { paymentRef: payment.reference };
  },
});

// onEnter
approved: [requestPayment],

// transitions
paid: {
  from: 'approved',
  to: 'paid',
  guard: systemOnly,
  accept: ['paymentRef'],
},
paymentFailed: {
  from: 'approved',
  to: 'paymentNeedsAttention',
  guard: systemOnly,
  accept: ['error'],
},
retryPayment: {
  from: 'paymentNeedsAttention',
  to: 'approved', // re-enters approved, so requestPayment runs again
  guard: financeOnly,
},
```

`retryRun()` on the failed run does not undo `onFailure`: a late success would try `paid` from `paymentNeedsAttention` and be refused with `INVALID_STATE`. Decide the recovery path explicitly — here finance sends the report back through `approved`, which runs the effect afresh. The idempotency key deduplicates the call only if the payment service enforces it; pass `signal` to services that can cancel.

## 9. Confirm by webhook

When the provider confirms asynchronously, the effect only starts the payment and the provider's callback fires the transition. The sender's event id, namespaced by source, is the `requestId`, so a redelivered callback is a replay rather than a second transition.

```ts
const requestPayment = defineEffect({
  name: 'expenses.requestPayment',
  retry: { attempts: 3, backoffMs: 2_000 },
  // No onSuccess: the provider's callback moves the record on.
  run: ({ record, idempotencyKey, services }) =>
    services.payments.start(record.applicantId, record.amountCents, {
      idempotencyKey,
    }),
});

router.post('/payments/callback', async (c) => {
  const event = await services.payments.verify(c); // authenticate the sender first
  await runtime.fire(
    'expenses',
    event.metadata.expenseId,
    event.ok ? 'paid' : 'paymentFailed',
    {
      actor: SYSTEM_ACTOR,
      requestId: `payments:${event.id}`,
      input: event.ok
        ? { paymentRef: event.reference }
        : { error: event.failureReason },
    },
  );
  return c.body(null, 204);
});
```

A callback for a record that has already moved on is refused with `INVALID_STATE`; answer 204 regardless, or the provider keeps retrying. A replay returns the first log entry with `replayed: true` and the record as it is now.

## 10. Write related data with the transition

Confirming an order must reserve stock in the same database transaction, and a failed reservation must leave the order unconfirmed.

```ts
runtime.register(orderLifecycle, {
  services: (handle) => ({ stock: stockService.bound(handle) }),
});

// transitions
confirm: {
  from: 'draft',
  to: 'confirmed',
  guard: purchaserOnly,
  onTransition: async ({ record, entry, services }) => {
    await services.stock.reserveOrThrow(record.id, { transitionId: entry.id });
  },
  effects: [sendConfirmation],
},
```

`onTransition` runs after the record and the log entry are written, in the same transaction; throwing rolls back the state, the log entry and the reservation together. The service must use the transaction it was bound to and enforce availability atomically. An approval comment row, an audit row or a reservation belong here; a remote warehouse API does not, because a database rollback cannot undo an HTTP call — that is an effect with a follow-up transition, as in [the background process](#7-a-background-process-in-steps).

## 11. Wait for every signer

Every assigned reviewer must agree; one objection ends the review. The record keeps who has signed, and `route` keeps the task in `signing` until the last agreement.

```ts
// transitions
sign: {
  title: 'Countersign',
  from: 'signing',
  to: ['signing', 'approved', 'rejected'],
  guard: ({ record, actor }) =>
    (record.assignees.includes(actor.id) &&
      !record.signedBy.includes(actor.id)) || {
      code: 'notYourTurn',
      message: 'Only an assignee who has not signed yet can countersign.',
    },
  validate: (input) =>
    input.decision === 'agree' || input.decision === 'reject'
      ? null
      : [{ field: 'decision', message: 'Choose a decision.' }],
  route: ({ record, actor, input }) => {
    if (input.decision === 'reject') return 'rejected';
    const signed = new Set([...record.signedBy, actor.id]);
    return record.assignees.every((id) => signed.has(id))
      ? 'approved'
      : 'signing';
  },
  set: ({ record, actor }) => ({ signedBy: [...record.signedBy, actor.id] }),
},
```

Create the record with `signedBy: []` and a non-empty `assignees`. Two signers acting at once both read the same `signedBy`; the second write fails its version check with `CONFLICT`, the page reloads, and they sign again on the updated list. Because entering `signing` again would re-run `onEnter.signing`, put the invitation on the transition that first enters review. For individual decisions with their own comments and deadlines, use child records instead of a growing array ([next pattern](#12-wait-for-child-tasks)).

## 12. Wait for child tasks

A document has several extraction tasks, each a record with its own lifecycle and a `parentId`. The document may finish only when no task is still open.

```ts
runtime.register(documentLifecycle, {
  services: (handle) => ({ tasks: taskService.bound(handle) }),
});

// parent transitions
complete: {
  from: 'processing',
  to: 'done',
  guard: async ({ record, actor, services }) => {
    if (actor.id !== record.ownerId)
      return { code: 'ownerOnly', message: 'Only the owner can finish.' };
    return (await services.tasks.countOpen(record.id)) === 0 || {
      code: 'openTasks',
      message: 'Finish the outstanding tasks first.',
    };
  },
},
```

The guard alone is not enough when another transaction can create a child while the completion is being decided. Create children in a transaction that first touches the parent while it is still in the right state, bumping its version, so a `complete` decided on a stale count meets a conflict:

```ts
async createTask(parentId, values) {
  return this.database.transaction(async (connection) => {
    const open = await connection.repository('documents').updateMany({
      filter: { id: parentId, status: 'processing' },
      values: { lifecycleVersion: { increment: 1 } },
    });
    if (open.updatedCount === 0) return undefined; // the parent moved on
    const created = await connection.repository('tasks').createOne({
      values: {
        ...values,
        parentId,
        status: 'pending',
        statusChangedAt: this.now(),
        lifecycleVersion: 0,
      },
    });
    return created.record;
  });
}
```

To have the last task finishing move the parent on without waiting for a person, give the task's finishing transition an effect that fires the parent:

```ts
const nudgeParent = defineEffect({
  name: 'tasks.nudgeParent',
  run: async ({ record, services }) => {
    if ((await services.tasks.countOpen(record.parentId)) > 0)
      return { waiting: true };
    // Refused with INVALID_STATE or GUARD_REJECTED if the parent has moved on; that is fine.
    await services.runtime.fire('documents', record.parentId, 'complete', {
      actor: SYSTEM_ACTOR,
    });
    return { completed: true };
  },
});
```

Decide as explicitly how reopening a task relates to a parent that is already `done`; the library does not lock a parent-child graph for you. `OfficeStore.createExtraction()` in the office flows example is the complete version of the insert.

## 13. Dispatch sub-records repeatedly

A document in `dispatching` can be dispatched several times. Each dispatch is a self-transition whose input names the rows to send, and whose effect claims each row and creates its child under a unique key, so a retried effect creates nothing twice.

```ts
// transitions
dispatchClerks: {
  from: 'dispatching',
  to: 'dispatching',
  guard: registrarOnly,
  validate: (input) =>
    Array.isArray(input.rowIds) && input.rowIds.length
      ? null
      : 'There are no rows to dispatch.',
  effects: [dispatchClerks],
},

const dispatchClerks = defineEffect({
  name: 'incoming.dispatchClerks',
  retry: { attempts: 3, backoffMs: 1_000 },
  run: async ({ record, input, idempotencyKey, services }) => {
    // Claims each row (dispatched: false → true) and creates its task in one transaction.
    const result = await services.store.dispatch(1, input.rowIds);
    // A ledger keyed by (root, level, recipient): nobody is reminded twice.
    await services.store.notify({
      rootId: record.id,
      level: '1',
      recipients: result.recipients,
      message: `Document ${record.title} was distributed to you.`,
    });
    // The run's key has a unique index: one trace however many attempts run.
    await services.store.trace({
      key: idempotencyKey,
      docId: record.id,
      action: 'dispatch',
      detail: result,
    });
    return { created: result.created.length };
  },
});
```

The effect is written so that every step may run twice: a row already claimed is reported again rather than skipped, so a retry after the reminders failed still sends them, while the ledger and the keyed trace keep the repeats from writing twice.

## 14. Add a rule from another plugin

A budget plugin vetoes approvals while a budget is frozen, without touching the expense definition. Its refusal joins the other blockers on the page and in the `fire()` error.

```ts
const removeGuard = runtime.addGuard(
  'expenses',
  ['approve'],
  async ({ record, services, transition }) => {
    const frozen = await services.budgets.isFrozen(record.budgetId);
    return (
      !frozen || { code: 'budgetFrozen', message: 'This budget is frozen.' }
    );
  },
);

// When the extension shuts down:
removeGuard();
```

`addGuard()` injects no services: `services.budgets` must already be part of what the lifecycle was registered with, bound to the transaction. If freezing a budget must serialize with approvals in flight, enforce that in the database too; a guard sees the budget as it is at decision time. Follow-up work that must happen is an effect, not a listener.

## 15. A to-do list from announce

`announce` fires once per transition the new state allows, which is what a to-do list needs: a person's pending work is the set of records with a transition they may fire.

```ts
runtime.on('announce', { lifecycle: 'expenses' }, async ({ record, next }) => {
  if (next !== 'approve') return;
  await todos.upsert({
    key: `expenses:${record.id}:approve`,
    assignee: record.approverId,
    title: `Approve ${record.title}`,
  });
});
runtime.on('completed', { lifecycle: 'expenses' }, async ({ record }) => {
  await todos.remove({ key: `expenses:${record.id}:approve` });
});
```

Delivery is best effort: a listener that throws is logged, and nothing is redelivered after a crash. Rebuild the list from the records when that matters, or make each to-do a child record with its own lifecycle.

## 16. Duplicate requests and stale pages

A decision belongs to the version the person saw, and a transport retry belongs to the same decision.

```ts
const requestId = crypto.randomUUID(); // once per decision, reused by its retries
await runtime.fire('expenses', expenseId, 'approve', {
  actor,
  input: { comment: 'Within budget.' },
  requestId,
  expect: { version: displayedVersion },
});
```

A `CONFLICT` means the record changed since the page was loaded: reload and let the person decide again; do not retry with the newer version. A repeated `requestId` replays the earlier log entry, marked `replayed`, and returns the record as it is now. The React hook sends a fresh key and the displayed version per `fire()` call, so calling it again is a new decision. For a webhook, derive the key from the sender's delivery id, namespaced by source, as in [confirm by webhook](#9-confirm-by-webhook).

## 17. A data fix as a transition

A record stuck in the wrong state is fixed with a transition only the system may fire, so the fix is logged and the version moves on. A script fires it for each record, keyed so that rerunning the script changes nothing.

```ts
// transitions
repair: {
  from: 'awaitingManager',
  to: 'draft',
  guard: systemOnly,
  validate: (input) => (input.reason ? null : 'Say why the record is being repaired.'),
  accept: ['reason'],
  set: () => ({ approverId: null }),
},

for (const id of stuckIds)
  await runtime.fire('expenses', id, 'repair', {
    actor: SYSTEM_ACTOR,
    input: { reason: 'Approver left the company; ticket OPS-123' },
    requestId: `repair:OPS-123:${id}`,
  });
```

Never update the state field directly: it bypasses the guards, the log, the effects and the version check, and leaves no record of who did it.

## 18. Permissions on the standard routes

Guards express business rules; `authorize` on the routes is where access control goes. Map each transition to a permission and keep `operate` for operators.

```ts
createLifecycleRoutes(runtime, {
  lifecycles: ['expenses'],
  actor: (c) => ({ id: String(c.get('auth').user.id) }),
  authorize: async (access, actor, c) => {
    const acl = c.get('acl');
    switch (access.action) {
      case 'describe':
      case 'read':
        return acl.can(actor.id, `${access.lifecycle}:read`);
      case 'fire':
        return acl.can(actor.id, `${access.lifecycle}:${access.transition}`);
      case 'operate':
        return acl.can(actor.id, 'lifecycle:operate');
    }
  },
});
```

`authorize` runs before the lifecycle's own guards, so a person without the permission never learns the business reason, and a person with it still meets the guard's blockers on the page.

## 19. Testing waits, retries and refusals

The test kit runs a lifecycle on a memory store with a clock to advance; `fire()` returns once every effect it caused, and every transition those fired, has finished.

```ts
const kit = createLifecycleTestKit(expenseLifecycle, {
  services: fakeServices,
  parameters: { escalateAfterDays: 3 },
  now: '2026-10-01T09:00:00Z',
});

it('escalates to the next manager after three idle days', async () => {
  const report = await kit.start(
    { applicantId: 'alice', amountCents: 800_000 },
    { actor: 'alice' },
  );
  await kit.fire(report, 'submit', {}, { actor: 'alice' });
  kit.advance({ days: 3, minutes: 10 });
  expect(await kit.runTriggers()).toBe(1);
  expect(kit.get(report)).toMatchObject({
    status: 'awaitingManager',
    approverId: 'carol',
  });
  expect(await kit.history(report)).toEqual(['$create', 'submit', 'escalate']);
});

it('pays after one failed attempt, under one idempotency key', async () => {
  const report = await kit.start(
    { applicantId: 'alice', amountCents: 300_000 },
    { actor: 'alice' },
  );
  kit.failEffect('expenses.requestPayment', { times: 1 });
  await kit.fire(report, 'submit', {}, { actor: 'alice' });
  expect(kit.get(report).status).toBe('paid');
  expect(await kit.effectRuns(report)).toMatchObject([
    { effect: 'expenses.notifyApplicant', status: 'succeeded' },
    { effect: 'expenses.requestPayment', status: 'succeeded', attempts: 2 },
  ]);
});

it('refuses an approval from anyone but the approver, and says why', async () => {
  const report = await kit.start(
    { applicantId: 'alice', amountCents: 800_000 },
    { actor: 'alice' },
  );
  await kit.fire(report, 'submit', {}, { actor: 'alice' });
  expect(await kit.can(report, 'approve', 'alice')).toMatchObject({
    allowed: false,
    blockers: [{ code: 'approverOnly' }],
  });
  await expect(
    kit.fire(report, 'approve', {}, { actor: 'alice' }),
  ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
});
```

Only the Repository store needs a database: the plugin's provider test against SQLite, with the migration applied, covers the wiring once.

## From a recipe to a working plugin

Create records with `runtime.create()` and change their state with `runtime.fire()`; keep the state, timestamp and version fields out of ordinary CRUD routes. Declare the business and log tables in a self-contained migration, mount the routes behind authentication and `authorize`, start `createLifecycleJobs()`, and test refusals and failures with the kit. The [guide's checklist](guide.md#before-going-live) covers what remains before going live.

For complete source, read [the help desk and expense plugin](../../../examples/app-plugin-lifecycle-example/README.md), starting with its `server/lifecycles/`, and [the office flows plugin](../../../examples/app-plugin-office-flows-example/README.md) for parent-child coordination, distribution and countersigning. They include the application helpers these recipes leave out.
