# @nocobase/app-plugin-approval

Approvals on record lifecycles from `@nocobase/lifecycle`. The business record stays a plain lifecycle: while an approval decides, it waits in one state, its version and clock untouched, and it learns only how the approval ended, through exit transitions it declares itself. What happens meanwhile — each stage, each person's task, every answer, claim, hand-over, added signer and return — lives in this plugin's own collections, and the answer that ends the approval moves the record in the same transaction.

## What it contributes

| Part                                 | What it is                                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approvalRuns`                       | One row per approval of a record: the plan it was submitted under, the content under review, the changes its stages proposed, and how it ended. A run is a lifecycle record of its own whose states are the stages, so its moves are in the transition log too |
| `approvalTasks`                      | One row per person's part in a stay in a stage: a decision, an opinion, material, a copy to read. Nothing in it is specific to one business, so a to-do list reads it as it is                                                                                 |
| `approvalEvents`                     | What happened to a run that is not a transition: answers, claims, hand-overs, signers added, notes                                                                                                                                                             |
| `defineApproval()`                   | Turns stages, who decides each and how their answers add up into the run's lifecycle and the state the business record waits in                                                                                                                                |
| `ApprovalService`                    | Answers, claims, releases, hands over, adds signers, consults, asks for material, returns, revises, reassigns and lists tasks, each in one transaction                                                                                                         |
| `allPolicy`, `anyPolicy`, and others | How a stage's answers add up: everyone, anyone, the first, a threshold, a pool to take from, a sequence, line by line. A new rule is a `StagePolicy`, a pure function the layer never needs to change for                                                      |

The plugin's migration creates the three collections on the application's default connection. It registers no routes and no pages: the business plugin that defines an approval owns its runtime, its routes and its authorization.

## Defining an approval

```ts
import { defineLifecycle } from '@nocobase/lifecycle';
import {
  defineApproval,
  stagesFor,
} from '@nocobase/app-plugin-approval/server';

const stage = stagesFor<ContractTypes>();

export const contractApproval = defineApproval<
  ContractTypes,
  'manager' | 'legal'
>({
  name: 'contract',
  applicant: (record) => record.applicantId,
  directory: (services) => services.org,
  // The fields every decision is bound to.
  freeze: ['amount', 'terms'],
  flow: ['manager', 'legal'],
  stages: {
    manager: stage.single({
      assignee: ({ applicantId, directory }) =>
        directory.managerOf(applicantId),
    }),
    legal: stage.all({
      assignees: ({ services }) => services.org.holders('legal'),
      canRevise: ['terms'],
    }),
  },
  exits: {
    approved: 'approve',
    rejected: 'reject',
    returned: 'returnToApplicant',
  },
});

export const contractLifecycle = defineLifecycle<ContractTypes>({
  name: 'contracts',
  initial: 'draft',
  states: [
    'draft',
    contractApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
  ],
  transitions: {
    submit: { from: 'draft', to: 'approving' },
    withdraw: { from: 'approving', to: 'draft' },
    approve: {
      from: 'approving',
      to: 'approved',
      manual: false,
      set: contractApproval.settle,
    },
    reject: { from: 'approving', to: 'rejected', manual: false },
    returnToApplicant: {
      from: 'approving',
      to: 'draft',
      manual: false,
      set: contractApproval.settle,
    },
  },
});
```

`contractApproval.state('approving')` is the whole waiting state: entering it starts a run, and leaving it before the run ends — a withdrawal, a timeout — cancels the run and closes its tasks in the same transaction. The exits are `manual: false`, so no page can skip the stages that decide them. A change a stage proposes is kept on the run and written to the record only when the run ends approved or returned, through `set: contractApproval.settle`; an exit that drops those changes fails the run's end rather than losing them.

Register the run's lifecycle beside the business's, on the same runtime, and give the service the approvals it serves:

```ts
runtime.register(contractLifecycle, { services });
runtime.register(contractApproval.lifecycle, { services });
const approvals = new ApprovalService(runtime, [contractApproval], services);

await approvals.respond({ taskId, actor: { id: userId }, answer: 'approve' });
```

The runtime must run on the Repository store, `createRepositoryLifecycleStore()`, against the connection this plugin's migration ran on: the layer writes its rows through the transaction handle the runtime hands it, so a refused transition takes its tasks and events back with it. The memory store works the same way in tests.

## How it stays correct

- An answer that leaves a stage open writes only the task; the business record, its version and its `statusChangedAt` do not move.
- Every task belongs to one stay — a stage of a run, entered at one run version. Leaving the stage ends every task of the stay still open, so an answer arriving afterwards is refused and writes nothing.
- The answer that ends a stage fires the run's transition, and the run's end fires the business record's exit, in the answer's own transaction. If the record has already moved on, the whole answer rolls back.
- Two events on one task are serialized by a conditional update on the task's status and row version, not by a lock.

## Testing

`tests/policies.test.ts` checks each stage policy as the pure function it is. `tests/approval-run.test.ts` checks the contract between a business record and its run on memory storage: a run starts on entering the state, is cancelled on leaving it, and ends through the business's exits with the changes it settled. `tests/database.test.ts` runs the migration up and down on SQLite, an approval on the Repository store, and the sweep's escalation.

`@nocobase/app-plugin-approval-example` runs 28 approval scenarios on this layer, in its tests on memory storage and in its approval center and lab on the application's database; it is where a change to the layer meets every policy, return, delegation and parallel review at once.

```bash
pnpm --filter @nocobase/app-plugin-approval lint
pnpm --filter @nocobase/app-plugin-approval typecheck
pnpm --filter @nocobase/app-plugin-approval test
pnpm --filter @nocobase/app-plugin-approval build
```
