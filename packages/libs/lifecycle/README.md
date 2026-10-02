# @nocobase/lifecycle

Record lifecycles: a business record keeps its state in one of its own fields, every change is a transition declared in source, and the effects a transition owes run after it commits. There is no separate process instance, so where a record stands is never kept in two places.

```ts
import {
  defineEffect,
  defineLifecycle,
  type Lifecycle,
} from '@nocobase/lifecycle';

export const ticketLifecycle: Lifecycle<TicketTypes> =
  defineLifecycle<TicketTypes>({
    name: 'tickets',
    initial: 'open',
    states: ['open', 'awaitingCustomer', 'closed'],
    parameters: { waitHours: 72 },
    transitions: {
      replyToCustomer: {
        from: 'open',
        to: 'awaitingCustomer',
        effects: [notifyCustomer],
      },
      customerReplied: { from: 'awaitingCustomer', to: 'open' },
      close: { from: ['open', 'awaitingCustomer'], to: 'closed' },
    },
    triggers: {
      autoClose: {
        transition: 'close',
        when: 'awaitingCustomer',
        after: ({ waitHours }) => waitHours * 3_600_000,
      },
    },
  });
```

| Concept    | What it is                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transition | `from`, `to`, and optionally `guard` (may this actor fire it, and if not, why), `validate` (input problems), `accept` (input fields written onto the record), `route` (pick one of several `to`) and `set` (other fields) |
| Effect     | A function run after commit, with `retry`, a stable `idempotencyKey`, and `onSuccess`/`onFailure` transitions, fired with the effect's result or its error as input; `onEnter` runs effects per state                     |
| Trigger    | Fires a transition on records idle in a state for longer than `after`, found by a query rather than a timer per record                                                                                                    |

`LifecycleRuntime.fire()` checks the state, writes the record, a transition log entry and the effect runs in one transaction, guarded by a conditional update so two concurrent transitions of one record cannot both commit. The condition is the state and an integer version every transition increments (`versionField`, `lifecycleVersion` by default), so two transitions that leave the state unchanged — an escalation, a follow-up reply — are refused just the same. `fire()` also takes `expect: { version }`, so a decision made on a page showing an older version is refused rather than applied.

Effects are handed to an `EffectDispatcher` after commit. Every write an attempt makes names that attempt, so an attempt `recover()` took back cannot record a result over the one that replaced it; recording the outcome and firing `onSuccess` or `onFailure` commit together, so a stop between them never strands a record; and a run whose every attempt was interrupted becomes `dead` instead of running forever. `runTriggers()` sweeps the triggers, rechecking inside the transaction that a record is still idle, and `recover()` hands over queued runs and takes back stalled attempts after a restart.

`createRepositoryLifecycleStore()` persists through `@nocobase/db` Repositories on the record's own collection plus two collections the owning plugin's migration creates (`LIFECYCLE_COLLECTIONS` names them and lists their fields, and the `collections` option renames them). The record's collection needs the state, its timestamp and the version, an integer that defaults to 0; the transition log needs a unique index on `(lifecycle, recordId, version)`. `MemoryLifecycleStore` keeps everything in process.

A guard, `route` or `set` that reads other collections must read through the transaction it runs in: on SQLite the transaction holds the only connection, and a read on the database manager waits for it forever. Register the services as a factory and use the handle it receives — the store's `transactionHandle`, a `DatabaseConnection` inside a transition and `undefined` elsewhere:

```ts
runtime.register(requestLifecycle, {
  services: (handle) => ({ store: store.bound(handle) }),
});
```

## Describing a lifecycle

A state is a name or `{ name, title, final, meta }`, and a transition may carry `meta` too, so a page can label, colour and confirm from the definition. `from` takes one state, several, `'*'` for every state that is not final, or `{ except: [...] }`. The definition is checked when the module loads: every state must be reachable from an initial state, a final state may have no transition leaving it, and any other state must have one — a state with no way out is almost always a forgotten transition, so it has to be marked final to pass. `describe()` returns all of it, effects' continuations included, and `toMermaid(describe())` draws it as a Mermaid state diagram, marking the transitions triggers fire and the ones effects continue with.

## Explaining refusals and creating records

A guard answers `true` to allow a transition, or refuses it with `false`, a message, or `{ code, message }`. `available()` returns every transition the record's state allows with `allowed` and `blockers`, one per guard that refused, and `can(name, id, transition, actor)` answers for one transition, a `state` blocker included when the record is in the wrong state. `fire()` asks the same guards in the same way and refuses with a `LifecycleError` that carries the blockers, so what a button shows and what a click does cannot disagree. `validate` returns a message, a list of `{ field, message }` problems, or nothing; the refusal carries the problems.

Other code can veto transitions without touching the definition: `runtime.addGuard(name, transitions, guard)` adds a guard to some transitions or to `'*'`, its refusals join the blockers, and the function it returns removes it.

`runtime.create(name, values, { actor, state })` creates a record in an initial state — `initial` may list several, the first being the default — and in the same transaction writes a log entry from `null` under `CREATE_TRANSITION` and the runs the state's `onEnter` effects owe, so a record's history starts at its creation. The transition log's `from` is therefore nullable.

## Extending a lifecycle

`onTransition` on a transition runs inside its transaction, after the record and the log entry are written, with the transaction's handle and services built from it: write related rows that must commit with the state, or throw to refuse the transition and roll everything back.

`runtime.on(event, filter, listener)` hears transitions after they commit: `completed` once per transition and creation, `entered` once per state entered, and `announce` once per transition the new state allows, which is what a to-do list needs. A filter narrows by `lifecycle`, `transition` and `state`. Delivery is best effort — a listener that throws is logged, and nothing is delivered again after a crash — so work that must happen belongs in an effect, not a listener.

## Operating effects

`retry` takes `attempts`, `backoffMs`, a growth `factor`, a cap `maxMs` and `shouldRetry(error, attempt)` for errors not worth another try, such as a declined payment; `timeoutMs` fails an attempt that runs longer and aborts its signal. `fire()` takes a `requestId`: the same request sent again for a record finds its first log entry and changes nothing, which makes a retried form submission or webhook safe — the transition log keeps it under a unique index.

`listEffectRuns(query)` lists runs by lifecycle, record, effect and status, each saying whether this process knows its effect; a run naming an effect no registered lifecycle declares stays queued, because in a rolling deploy another process may know it. `retryRun(id)` runs a failed, dead or cancelled run again from its first attempt; `cancelRun(id)` gives up on a queued or running one, aborting an attempt in this process and discarding the outcome of one elsewhere. `prune({ olderThan })` deletes succeeded and cancelled runs last changed before then.

## Testing a lifecycle

`@nocobase/lifecycle/testing` runs one lifecycle on a memory store, a fake clock and in-process effects, so waiting, retrying and continuing are unit tests:

```ts
const kit = createLifecycleTestKit(ticketLifecycle, { services });
const ticket = kit.create({ customerEmail: 'a@example.com' });
await kit.fire(
  ticket,
  'replyToCustomer',
  { message: 'Please confirm' },
  { actor: 'agent' },
);
kit.advance({ hours: 73 });
await kit.runTriggers();
expect(kit.get(ticket).status).toBe('closed');
```

`kit.failEffect(name, { times })` makes the next attempts of an effect throw. `packages/examples/app-plugin-lifecycle-example` wires two lifecycles to an application's database and jobs service.
