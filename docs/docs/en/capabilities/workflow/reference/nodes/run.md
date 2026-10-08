---
title: 'Run node'
description: 'Execute typed business actions and provide results to later nodes.'
keywords: 'NocoBase,workflow,Agent'
---

# Run node

Run executes a server handler shipped with the workflow package. Use it for calculations, data operations, or application Service calls. It performs a business action; it cannot choose branches or pause and later resume.

## Define a Run node

```ts
import type { run as calculateRisk } from './server/calculate-risk';

createRunInstruction({
  key: 'calculateRisk',
  title: 'Calculate risk',
  description:
    'Calculate a risk score from the amount and customer tier for later decisions.',
}).run(defineHandler<typeof calculateRisk>('./server/calculate-risk'));
```

The module path must be a static string starting with `./`, relative to the package, without an extension. Nodes declare neither argument mappings nor result Schemas.

## Write a handler

```ts
// server/calculate-risk.ts
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import type { FlowContext } from '../workflow';

export async function run(
  { input }: FlowContext,
  options: WorkflowRunOptions,
): Promise<{ score: number }> {
  options.signal.throwIfAborted();
  const score = input.amountCents / 1000;
  options.logger.info('Quotation risk calculated', {
    quotationId: input.quotationId,
  });
  return { score };
}
```

Export a named `run` function:

- Its first argument is `{ input, parameters, nodeResults }`, typed with `FlowContext` from `workflow.ts`; see [Handlers and shared context](../dsl.md#handlers-and-shared-context).
- Its second supplies `services` (read-only Service resolution), `signal` (cancellation), and `logger` (bound to the run).
- Its return value becomes the result. Later nodes read `nodeResults.<node-key>`, with types inferred from the return type.

## Call application Services

Import a public token from the owning package, then resolve it with `options.services.resolve(token)`. Do not create a token with the same name or modify the application container through another path.

Tokens and methods depend on the application; the agent must inspect actual contracts. Services own writes, transactions, and external protocols; handlers read context and invoke them.

## Return results

Return `null`, booleans, finite numbers, strings, arrays, or plain JSON objects. `undefined` is stored as `null`. Convert BigInt, nonfinite numbers, functions, Symbol, Date, Map, circular objects, and ORM instances into plain JSON data before returning them.

`{ status: 'failed' }` is ordinary data, not node failure. Throw an exception for execution errors. Expected business conclusions can be data for a later Condition.

## Logging and cancellation

Use `options.logger` for necessary diagnostic information without passwords, tokens, or complete sensitive data. Call `signal.throwIfAborted()` at entry and between expensive steps, and pass the signal to I/O that supports cancellation.

Cancellation cannot undo committed transactions, sent messages, or external requests.

## Idempotent side effects

New manual runs or application recovery can repeat business actions. Use stable business IDs, unique constraints, or idempotent Services for records and external idempotency keys for integrations. eventKey prevents a second run for the same event, not duplicate effects inside business actions; see [Deduplicate with eventKey](../service-api.md#deduplicate-with-eventkey).

## Common questions

### Why is the module or run export missing at runtime?

Check the `./` path, omitted extension, matching server build output location, and named `run` export.

### Why declare explicit handler return types?

Handlers reference `FlowContext`, which is inferred from node returns. Explicit return types break the inference cycle.
