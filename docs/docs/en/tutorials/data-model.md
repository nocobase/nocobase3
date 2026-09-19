---
title: '1. Create orders and customers'
description: 'Define the fields used throughout the order tutorial.'
---

# 1. Create orders and customers

An order belongs to one customer; a customer can have several orders. In this example, “远山科技” is a customer and `SO-001` is an order for CNY 1,280.

## Chapter goal

Finish with customer and order tables plus two customer records. There is no order page yet: this chapter establishes the information and relationships later features will use.

## Tables, fields, and relationships

A table stores records of one kind. Fields describe what each record contains. One customer is a customer record; its name and contact are fields.

An order references the customer through `customerId` instead of copying its name and contact every time. Multiple orders can reference the same customer, keeping one place to maintain contact information.

Integer cents give input, calculations, and display an explicit unit. Convert CNY `1280` in the form to `128000` cents in storage. Later checks use this convention.

## Agree on the fields

Use `tutorialCustomers` for customers:

| Field     | Purpose             | Rule                         |
| --------- | ------------------- | ---------------------------- |
| `id`      | Customer identifier | Server-generated primary key |
| `name`    | Customer name       | Required                     |
| `contact` | Contact name        | Required                     |

Use `tutorialOrders` for orders:

| Field         | Purpose          | Rule                                            |
| ------------- | ---------------- | ----------------------------------------------- |
| `id`          | Order identifier | Server-generated primary key                    |
| `number`      | Order number     | Required and unique, such as `SO-001`           |
| `customerId`  | Related customer | Required reference to the customer's `id`       |
| `amountCents` | Amount in cents  | Positive integer; CNY 1,280 is `128000`         |
| `ownerId`     | Applicant        | Taken from the authenticated user on the server |
| `status`      | Current state    | Initially `draft`                               |
| `version`     | State revision   | Initially `0`; increment on every transition    |
| `comment`     | Approval comment | Initially an empty string                       |

Use only `draft`, `submitted`, `approved`, and `rejected` as status values. Keep these names throughout the tutorial.

## Ask your AI Agent to create the tables

Give the AI Agent the field tables above and this prompt:

```text
Read this application's AGENTS.md and the data modeling and migration references in its application development Skill.

Create tutorialCustomers and tutorialOrders using the agreed fields. Reference customers through customerId, enforce unique order numbers, and store amounts as integer cents. Add a new migration. Do not change applied migrations or reset the database.

Prepare two example customers: 远山科技 (contact 林女士) and 星河商贸 (contact 周先生). Repeating the seed must not duplicate them. Do not seed orders: their ownerId will come from the signed-in user when orders are created.

Run the migration and check primary keys, uniqueness, customer references, and amount validation. Report the files and actual check results.
```

Migrations belong in `database/main/migrations/`; seeds belong in `database/main/seeds/`. A migration defines structure; a seed inserts example data.

```bash
pnpm migrate
pnpm seed
pnpm collections:generate
```

The final command generates database descriptions. Editing those generated files does not create a table. A migration reported as skipped may already have run on startup; inspect the actual structure.

## Check the result

Ask the AI Agent to query both tables. There should be two customers with distinct IDs, a customer reference on orders, a unique order number constraint, and an integer amount. An empty order table is expected at this point.

If migration fails, inspect the named migration and its error. Do not use `migrate --fresh` to erase earlier work.

Next: [Build list and detail pages](./pages).
