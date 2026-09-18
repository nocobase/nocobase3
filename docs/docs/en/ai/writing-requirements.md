---
title: 'Write requirements'
description: 'Explain roles, actions, data, and completion criteria to your AI Agent.'
---

# Write requirements

Start with the business outcome, then add rules and examples. Let your AI Agent read the project before proposing filenames, APIs, and implementation details.

## Start with one concrete interaction

“Build an order system” leaves too much open: fields, editing rules, and the definition of done. A smaller first round gives you something you can inspect.

This is an example prompt:

```text
I want to manage customer orders first.
After signing in, I can open an order list from the menu and see order numbers, customer names, and amounts.
I can create and edit orders. Amounts cannot be negative and order numbers must be unique.
Saved data must remain after refreshing the browser.
Do not add approvals, notifications, or bulk import in this round.
Inspect the existing project, implement these interactions, and verify them.
```

It defines the entry point, data, operations, limits, and completion criteria while leaving room to follow project conventions.

## Clarify rules that change behavior

You do not need a long specification immediately. Include details that affect the result:

| Information         | Order example                                                                  |
| ------------------- | ------------------------------------------------------------------------------ |
| Who acts            | Staff create orders; managers approve them                                     |
| What the data means | Amounts use currency units with two decimals; each order belongs to a customer |
| What is allowed     | Drafts can be edited; approved amounts cannot                                  |
| What is visible     | Staff can see only their own orders                                            |
| How to verify       | Another staff account cannot see orders outside its scope                      |

“Own orders” might mean creator, assignee, or department. Ask your AI Agent to list unresolved questions and clarify them before implementation.

## Give a valid and an invalid example

```text
ORD-001 for customer 青禾商贸 with amount 1280 should save.
Creating ORD-001 again should report a duplicate without adding a second row.
An amount of -1 should be rejected with a clear explanation.
```

If the interface has specific requirements, add a reference image or describe button and field order. Otherwise, ask your AI Agent to follow the existing application style.

## Explain what an update must preserve

```text
The order list already supports creating and editing.
Only add search by customer name this time; preserve existing fields, navigation, and saving.
Clearing search should show all orders the current user may access.
Recheck creation and editing afterward.
```

Describing the current state controls scope better than resending the entire original specification.

## Ask for verification results

Add this to the request:

```text
Report changed files, checks actually run, and their results.
List anything not verified separately. Explain failures rather than skipping them.
```

Then [review the output](./reviewing-output.md). For larger requests, [break the feature down](./complex-features.md) first.
