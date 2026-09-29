# Wait nodes and external resumption

A `wait` node leaves its Node Run `PENDING` and its Workflow Run `STARTED` until application business code submits a decision. The plugin does not register a timer, Webhook, approval source, or business correlation table for the application. The application owns those integrations, their authorization, and the stable mapping from a business event to the `runId` returned by `trigger()`.

Declare a stable node key and the result shape in the source workflow. The same key must be known to the code that resumes that business stage; share a constant or maintain it in one adapter. Renaming a key requires updating the resumer and accounting for older runs, which keep the workflow revision they started with.

```ts
import {
  createWaitInstruction,
  workflow,
} from '@nocobase/app-plugin-workflow/dsl';

const flow = workflow({ key: 'payment', title: 'Payment' }).addNode(
  createWaitInstruction<{ paymentId: string }>(
    {
      key: 'await-payment',
      description: 'Wait for the payment provider decision.',
    },
    {
      type: 'object',
      properties: { paymentId: { type: 'string' } },
      required: ['paymentId'],
    },
  ),
);
export default flow.finalize();
```

Resolve `workflowServiceToken` from the application container and call `workflowService.getInstruction('wait')`. The result is the bound Wait API, rather than the Instruction class. Submit `{ runId, nodeKey, status, result, idempotencyKey }` to `wait.resume()`; import `NODE_RUN_STATUS` from `@nocobase/app-plugin-workflow/server`. Use a stable business event id, such as a payment callback id, for `idempotencyKey`. An accepted receipt means the decision was persisted for queue processing; inspect the run when the caller needs completion. The same key and same decision return `duplicate`; the same key with different content throws a conflict error.

```ts
const wait = workflowService.getInstruction('wait');
const receipt = await wait.resume({
  runId,
  nodeKey: 'await-payment',
  status: NODE_RUN_STATUS.RESOLVED,
  result: { paymentId },
  idempotencyKey: paymentCallbackId,
});
```

`RESOLVED` continues to the successor, `FAILED` and `ERROR` follow the workflow's failure path, and `PENDING` consumes the current event while keeping the node available for a later event. `ABORTED` is reserved for engine cancellation and timeout. Results must be JSON values no larger than 65,536 UTF-8 bytes. A workflow-level timeout continues to run while waiting.

`wait.getPending({ runId, nodeKey })` reports `pending` with the optional correlation snapshot, `not-ready` before the node is reached, `finished` after the node has completed, `run-ended` after termination or expiry, `node-not-found`, `run-not-found`, or `ambiguous` if multiple instances of that key are pending. `wait.resume()` performs the lookup itself and may also return `busy` while a different decision is outstanding. Keep an early business event and retry after `not-ready`; do not guess a Node Run database id or select one of multiple pending instances.

The plugin republishes persisted decisions after a queue publication failure or restart and periodically scans for requests left by a stopped worker. The business code remains responsible for idempotency of its own external side effects.
