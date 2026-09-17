---
title: 'Build your first feature with an AI Agent'
description: 'Add an order list, create and edit orders, and verify persistence in a real NocoBase 3 application.'
---

# Build your first feature with an AI Agent

Build a small order feature: sign in, view orders, add one, and change its amount. Store the data in the application database so it survives a browser refresh.

## Describe this round of work

Finish [creating the application](./create-app), keep development running, and open the application root with your AI Agent. You can use this prompt:

```text
Read the project's AGENTS.md and relevant development guidance first.

Add a simple order-management feature:
- Signed-in users can open an order list from the menu, create orders, and edit them.
- Each order has an order number, customer name, and amount. Amounts cannot be negative and order numbers must be unique.
- Save to the application database so the data survives a browser refresh.
- Do not add approvals, notifications, or complex roles in this round.
- Use the project's components and English/Chinese translations. Protect the API as well.

Verify creation, editing, and refresh persistence. Report changed files and actual check results.
```

Implement this feature in the application. It does not need a separately published plugin.

## Review the changed files

Review the changes in these locations:

| Location                              | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `database/main/migrations/`           | Create the order table with a unique order number                        |
| `server/routes/orders.ts`             | Read, create, and update orders; check authentication, access, and input |
| `server/routes/index.ts`              | Register the order API                                                   |
| `client/pages/orders.tsx`             | Display the list and create/edit form                                    |
| `client/routes.ts`                    | Add the page and menu entry                                              |
| `client/locales/en-US.ts`, `zh-CN.ts` | Add interface translations                                               |
| `package.json`, `pnpm-lock.yaml`      | Record server dependencies and versions                                  |

You do not need to understand every line first. Check that the changes match the task, then use the feature. `client/` contains browser pages, `server/` contains server endpoints, and `database/` records schema changes.

## Create an order

Sign in as the administrator used in the previous page. Open “Orders” and select “New order”. Enter:

| Field        | Example   |
| ------------ | --------- |
| Order number | `ORD-001` |
| Customer     | 青禾商贸  |
| Amount (CNY) | `1280`    |

![Order form; interface shown in Chinese](https://static-docs.nocobase.com/nb3-docs-20260916-order-form-cn.png)

Save and confirm the order appears. Refresh the browser and check it again. This catches implementations that only update the interface without saving to the database.

## Edit and check the result

Select “Edit order”, change the amount to `1380`, and save. Refresh again: the updated amount should remain.

![Order amount after editing and refreshing; interface shown in Chinese](https://static-docs.nocobase.com/nb3-docs-20260916-orders-cn.png)

Also try creating another `ORD-001` and entering a negative amount. Both must be rejected. Server validation must enforce the rules as well as the form.

## Keep working when a check fails

Give the AI Agent the actual command and full error. Ask it to explain and fix the cause, then run the check again. Removing checks or ignoring failures does not complete the feature.

Continue with [reviewing AI Agent output](../ai/reviewing-output.md), or learn how to [write clearer requirements](../ai/writing-requirements.md).
