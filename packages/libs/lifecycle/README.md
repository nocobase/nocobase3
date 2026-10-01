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

| Concept    | What it is                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transition | `from`, `to`, and optionally `guard` (may this actor fire it), `validate` (input), `route` (pick one of several `to`) and `set` (other fields)                                                        |
| Effect     | A function run after commit, with `retry`, a stable `idempotencyKey`, and `onSuccess`/`onFailure` transitions, fired with the effect's result or its error as input; `onEnter` runs effects per state |
| Trigger    | Fires a transition on records idle in a state for longer than `after`, found by a query rather than a timer per record                                                                                |

`LifecycleRuntime.fire()` checks the state, writes the record, a transition log entry and the effect runs in one transaction, guarded by a conditional update so two concurrent transitions of one record cannot both commit. Effects are handed to an `EffectDispatcher` after commit; `runTriggers()` sweeps the triggers and `recover()` hands over queued runs and takes back stalled attempts after a restart.

`createRepositoryLifecycleStore()` persists through `@nocobase/db` Repositories on the record's own collection plus two collections the owning plugin's migration creates (`LIFECYCLE_COLLECTIONS` names them, and the `collections` option renames them). `MemoryLifecycleStore` keeps everything in process.

A guard, `route` or `set` that reads other collections must read through the transaction it runs in: on SQLite the transaction holds the only connection, and a read on the database manager waits for it forever. Register the services as a factory and use the handle it receives — the store's `transactionHandle`, a `DatabaseConnection` inside a transition and `undefined` elsewhere:

```ts
runtime.register(requestLifecycle, {
  services: (handle) => ({ store: store.bound(handle) }),
});
```

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
