---
title: 'Quick start'
description: 'Run the quotation workflow included in the examples template and inspect branches, node results, and execution records.'
keywords: 'NocoBase,workflow,Agent'
---

# Quick start

Run the quotation workflow shipped with the `examples` template to experience “Enable → Run manually → Inspect the path and results”. Two fixed inputs demonstrate different branches, without writing a workflow or preparing business data tables.

The example compares a quotation amount with an administrator threshold, chooses manual follow-up or standard processing, and summarizes the result. It only records classification results and logs; it does not change orders or wait for human approval.

## Before you start

Prepare a NocoBase 3 application created from the `examples` template, start it with `pnpm dev`, and sign in as an administrator.

If you do not have an example application, follow [Create an application](../../get-started/create-app.md) to prepare a directory and agent session, and specify this request:

```text
Create and start a local NocoBase 3 application using the examples template. I want to try its built-in workflows. Tell me the application URL and administrator login details when it is ready.
```

If you already have a `default` or `hub` application, do not replace it for this tutorial. Create a separate example application or go directly to [Develop with an agent](./development/index.md) to implement your own workflow.

## 1. Find and enable the example

1. Open “Settings → Automation → Workflows”.
2. Find **Example: Quotation routing**, with key `example-quotation-routing`.
3. Enable it and open its details.
4. In “More actions → Parameter settings”, confirm `Manual follow-up threshold in cents` is `100000`. If another value is already set, change it and save. A new application defaults to `100000`.

Both amount and threshold are in cents. The threshold `100000` represents 1000 currency units; the condition checks whether the amount is **greater than or equal to** it.

Node labels come from the example source:

```text
Calculate quotation
  → At or above the review threshold?
      ├─ Yes → Flag for manual follow-up
      └─ No → Use standard processing
  → Summarize selected route
```

## 2. Run the manual follow-up branch

In workflow details, choose “More actions → Run manually” and enter:

| Input field           | Value    |
| --------------------- | -------- |
| `Quotation reference` | `Q-100`  |
| `Amount in cents`     | `150000` |

`Q-100` is an example identifier; you do not need a real quotation record. Submission opens the run details. Record the run ID and wait for “Completed”. If the result has not appeared, inspect execution records before submitting again.

## 3. Inspect the path and node results

Confirm the diagram follows `Flag for manual follow-up` and does not execute `Use standard processing`. Click nodes to inspect results and logs:

- `Calculate quotation` returns `quotationId: 'Q-100'` and `totalCents: 150000`.
- Condition returns `true`.
- `Flag for manual follow-up` returns `route: 'manual-follow-up'` and logs the classification.
- `Summarize selected route` returns:

```json
{
  "quotationId": "Q-100",
  "totalCents": 150000,
  "route": "manual-follow-up"
}
```

“Manual follow-up” is only a classification in this example. The workflow finishes normally.

## 4. Run the standard processing branch

Return to the same workflow details and run it manually again. Keep quotation reference `Q-100`, change the amount to `50000`, and keep the threshold at `100000`.

This creates a separate run. Compare the results:

| Amount in cents | Condition result | Selected branch             | Summary `route`    |
| --------------- | ---------------- | --------------------------- | ------------------ |
| `150000`        | `true`           | `Flag for manual follow-up` | `manual-follow-up` |
| `50000`         | `false`          | `Use standard processing`   | `standard`         |

Both runs should reach `Summarize selected route`. You can also find them under “Settings → Automation → Workflow runs” and inspect each by its run ID.

## Common questions

### The quotation example is missing

Confirm the application uses the `examples` template and `workflows/example-quotation-routing/workflow.ts` exists. Keep `pnpm dev` running and refresh the list. Other templates do not include this quotation example.

### The branch differs from this tutorial

Check the input amount and parameter settings for that run. Runs use their parameter snapshots; later threshold changes do not alter historical results. Set the threshold to `100000` before creating a new run to check.

### A run does not finish or reports an error

Record its ID, version, status, and error. Follow [Execution records and diagnosis](./management/run-inspection.md) or ask the agent to diagnose it.

## Next steps

- [Develop with an agent](./development/index.md): prepare the application and Skill to implement your own workflow.
- [Development process](./development/process.md): use inventory replenishment to describe requirements, review the plan, implement, and connect real triggers.
- [Manage workflows](./management/index.md): operate parameters, versions, manual runs, and execution records.
