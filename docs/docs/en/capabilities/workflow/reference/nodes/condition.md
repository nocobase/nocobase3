---
title: 'Condition node'
description: 'Select branches based on input, parameters, or upstream results.'
keywords: 'NocoBase,workflow,Agent'
---

# Condition node

Condition executes a decision handler shipped with the package: `true` selects `yes`, and `false` selects `no`. It represents an explicit business decision rather than data writes.

## Define a condition and branches

```ts
import type { run as needsReplenishment } from './server/needs-replenishment';

createConditionInstruction({
  key: 'needsReplenishment',
  title: 'Replenishment needed?',
  description:
    'Create replenishment when shortage is greater than zero; otherwise record sufficient stock.',
})
  .check(
    defineHandler<typeof needsReplenishment>('./server/needs-replenishment'),
  )
  .yes([createReplenishment])
  .no([recordStockSufficient]);
```

`createReplenishment` and `recordStockSufficient` are previously created Run nodes. Either branch can be omitted or empty to mean no additional steps. You can also use `.branch({ yes: [...], no: [...] })`.

Condition has a boolean result. Later nodes can read `nodeResults.needsReplenishment` to see the chosen path.

## Write the decision handler

Export a named `run` function receiving the read-only `{ input, parameters, nodeResults }` snapshots. Return a boolean or Promise of a boolean:

```ts
// server/needs-replenishment.ts
import type { FlowContext } from '../workflow';

export function run({ nodeResults }: FlowContext): boolean {
  const shortage = nodeResults.calculateShortage;
  if (shortage === undefined)
    throw new Error('Missing shortage calculation result');
  return shortage.quantity > 0;
}
```

Handle `undefined` when reading results. This example depends on a required upstream shortage node, so missing results are errors. Use defaults or default branches only if the business explicitly permits absence. Upstream return types infer result types automatically.

Decision logic is ordinary TypeScript, checked with the rest of the package and testable in isolation, without an expression language. Reading the rule requires opening the module, so describe it in the node’s `description`.

## Shared successor after branches

The next sibling of Condition is the shared successor. The selected branch completes before it runs; the unselected branch never executes. Terminate inside a selected branch ends the whole workflow and skips the shared successor.

## Common questions

### Why must the handler return a boolean?

The two paths mean Yes and No. Numbers, strings, or `null` cause errors rather than JavaScript truthiness conversion.

### Why was an unexpected branch selected?

Inspect the run’s input and parameter snapshots and Condition result. Do not infer historical behavior from current settings. Then inspect that version’s handler.

### Why is another branch’s result missing?

The branches do not run together. The other branch has no result for this run. Types allow access, but runtime returns `undefined`.
