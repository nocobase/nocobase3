---
title: 'Build complex features'
description: 'Split work across data, pages, permissions, and workflows into verifiable steps.'
---

# Build complex features

Orders with permissions, approvals, and notifications involve more than a form. Split the process into goals you can verify, then confirm each result before proceeding.

## Confirm the process first

Ask your AI Agent to prepare a plan:

```text
We can already create and edit orders.
Next, add manager approval and notify the requester after approval.
First list the business states, roles, and unresolved questions, then propose steps.
Do not change code in this round.
```

Confirm who submits, who approves, what rejection means, and whether approved data can change. Your AI Agent can organize these decisions; your team owns the business rules.

## Deliver a checkable result each round

This is an example breakdown, not a claim that your application already has these integrations:

| Round | Goal                              | Verification                                       |
| ----- | --------------------------------- | -------------------------------------------------- |
| 1     | Define order state and data       | Create and read a draft order                      |
| 2     | Complete pages and actions        | Open details, edit, and verify persistence         |
| 3     | Separate staff and manager access | Check both accounts' operations and data scope     |
| 4     | Integrate approval                | Confirm submission, approval, and rejection states |
| 5     | Integrate notifications           | The correct requester receives the result          |
| 6     | Build and deploy                  | Repeat the main flow in the target environment     |

Avoid splitting only by files, such as writing every API before any page. A usable or checkable result each round exposes misunderstandings sooner.

## Give the next round a clear starting point

```text
Order states are implemented, and creation and refresh checks passed.
Now implement staff submission and manager approval.
Preserve the existing list and editing behavior; follow the agreed rules for submitted orders.
Do not add notifications yet. We will do that after approval is verified.
```

Fix a previous round's failures before continuing, so later features do not depend on broken code.

## Resume after an interruption

Keep a project work record with the goal, agreed rules, completed steps, actual checks, open issues, and important file paths. Ask your AI Agent to read it and inspect the current code when resuming.

Do not rely solely on a long chat history or turn temporary progress into permanent rules. Put stable conventions in [team instructions](./team-conventions.md) and keep feature progress separately.

For a continuous example, see the [order tutorial](../tutorials/index.md). Continue [reviewing AI Agent output](./reviewing-output.md) at each step.
