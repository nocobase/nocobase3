---
title: 'Trigger workflows'
description: 'Trigger from business code or schedules, deduplicate with eventKey, and handle receipts.'
keywords: 'NocoBase,workflow,Agent'
---

# Trigger workflows

A definition does not automatically listen to business events. There are three trigger modes:

| Mode          | Use case                                              | Initiator                                      |
| ------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Business code | Start after stock changes or quotation submission.    | Application code calling the Workflow Service. |
| Schedule      | Daily reports or overnight checks.                    | Built-in `workflow` schedule target.           |
| Manual run    | Test a version or perform an administrator operation. | Administrator in management.                   |

See [Manual workflow runs](../management/manual-runs.md) for the third option. This page covers the first two. For extending node capabilities, see [Custom nodes](./custom-instructions.md).

## Trigger from business code

After the business operation succeeds, the code owning the event constructs input and invokes the workflow. For agent implementation and acceptance steps, see [Development process](../development/process.md#business-event-triggers).

### Resolve the workflow service

Import its public token from the server entry and resolve it from the application container:

```ts
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';

const workflow = app.container.resolve(workflowServiceToken);
```

The public Service exposes only `trigger()` and `registerInstruction()`. Queries, enablement, and manual execution use authenticated management APIs. Do not import internal plugin paths or create a token with the same name.

### Trigger a workflow

```ts
const receipt = await workflow.trigger(
  'quotation-routing',
  { quotationId: quotation.id, amountCents: quotation.amountCents },
  { eventKey: `quotation-submitted:${quotation.id}:${quotation.revision}` },
);
```

- The first argument is the directory name, not the title or database version ID.
- Input must match its Schema and serialize to at most 65,536 bytes.
- The caller owns authentication, authorization, and business validation. The plugin provides no generic HTTP endpoint anyone can use to trigger workflows.

### Handle the receipt

```ts
if (receipt.status === 'skipped') {
  // receipt.reason is 'not-found' (no current definition) or 'disabled'
  return;
}
// accepted: receipt.runId references a new or existing run
```

- `accepted`: the event is accepted; `runId` references a new or existing run. Duplicate eventKey returns the existing run without executing it again. Acceptance does not mean business success; inspect the final record.
- `skipped`: no run was created and there is no new run record to query. Use `reason` to correct deployment or follow the business policy.

Invalid or oversized input and excessive nested calls still throw errors, even when the workflow exists and is enabled.

### Deduplicate with eventKey

eventKey identifies a business event and is deduplicated across the application, not just one workflow. Include an event type or workflow identifier to avoid collisions between businesses:

- Redeliver the same event after network or queue retries with the same key; only one run is created.
- Use a new stable key for a genuinely new event, such as a stock revision or quotation revision.
- Omitting it generates a random key, which cannot express redelivery of the same event.

Do not use a changing timestamp as the identity of one event.

eventKey identifies a process invocation, not whether a side effect completed. New manual runs or application recovery can repeat business actions. Use business unique keys, database constraints, or external idempotency keys for writes, payments, and notifications.

Repeating an eventKey does not replay its failed run. The public Service provides no failed-run replay API. Confirm side effects before deciding to create another run or perform compensation. A new run uses a new invocation identity, while business writes keep the original unique key for idempotency.

### Where to trigger

- **Domain Service**: trigger after a successful write with stable domain IDs. Use application transaction and outbox designs if stronger write-and-trigger consistency is needed.
- **Protected HTTP Route**: authenticate, authorize, validate, and complete the domain operation before calling the Service.
- **Background task**: use stable event identity and handle `skipped`; being in a queue does not replace business idempotency.

## Scheduled triggers

The plugin registers a built-in `workflow` target with [Scheduler](../../scheduler.md). Scheduling decides when to execute; the workflow decides which steps run. Schedule configuration references the workflow directory and input. See [Development process](../development/process.md#scheduled-triggers) for agent requests and acceptance criteria.

Each occurrence supplies the event identity and does not run twice. Missing or disabled workflows and invalid input appear as failures or skip reasons in schedule execution records.

## Common questions

### Why is there no generic public HTTP trigger endpoint?

Business events have different authentication, authorization, input, and idempotency rules. Their Route, Service, Webhook, or task owns these boundaries and calls the internal Service.

### Why did the same eventKey not create a second run?

Deduplication is expected. If it is a genuinely new business event, use an identity distinguishing it; do not generate a random value just to bypass deduplication.

### Can the Service enable or modify workflows?

No. It supports business triggers and node registration only. Management UI and authenticated APIs own enablement, parameters, versions, and manual runs.
