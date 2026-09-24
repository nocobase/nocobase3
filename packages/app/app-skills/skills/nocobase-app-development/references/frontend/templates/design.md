# [Feature name] design

| Item          | Details                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| Status        | Draft / Pending review / Confirmed                                                     |
| Routes        | `/<path>`; child routes: `/<path>/:id` (detail drawer) …                               |
| Navigation    | Sidebar menu "[name]", icon `<LucideIcon>`; or: not shown in navigation                |
| Permissions   | All signed-in users (`authz: 'skip'`) / requires the page grant `page:<id>`            |
| Page template | `ui-guidelines.md` T1 list page / T2 detail view / T3 form / T4 settings page          |
| Confirmation  | Confirmed by the user on [date] / the user authorized skipping confirmation in advance |

## 1. Goals

Who uses this page and in what situation, and which tasks they need to complete (no more than 3).

## 2. Data and endpoints

### Fields

| Field | Type | Required | Validation rules | Shown in list | Edited in form |
| ----- | ---- | -------- | ---------------- | ------------- | -------------- |
|       |      |          |                  |               |                |

### Endpoints

| Method and path | Parameters | Response | Errors |
| --------------- | ---------- | -------- | ------ |
|                 |            |          |        |

If an endpoint already exists, note its source (file path); if it does not, this is the contract the backend implements.

## 3. Page structure

Wireframe:

```text
┌ PageHeader ─────────────────────────────────────┐
│ <Title>                     [+ Primary action]  │
│ <One-sentence description>                      │
└─────────────────────────────────────────────────┘
[Search…] [Filter ▾] [Clear filters]
┌ Table ──────────────────────────────────────────┐
│ Column 1 │ Column 2 │ Column 3 │ ⋯              │
└─────────────────────────────────────────────────┘
                                   [Pagination]
```

## 4. Component list

| Area | Component | Notes |
| ---- | --------- | ----- |
|      |           |       |

Components come from `client/components/ui/` or `client/components/`; for a component that has to be added, mark it "New" and give its source (the shadcn registry name).

## 5. States

| State         | Trigger | What is shown |
| ------------- | ------- | ------------- |
| Loading       |         |               |
| Empty         |         |               |
| No results    |         |               |
| Load failed   |         |               |
| Submitting    |         |               |
| Submit failed |         |               |

## 6. Interactions

Write each one as "trigger → result", with success and failure written separately:

- I-1 Click "[primary action]" → …
  - Success: …
  - Failure: …
- I-2 …

Also state which states are written to the URL, which actions need confirmation, and whether keyboard behavior has any special requirements.

## 7. Copy

| key | zh-CN | en-US |
| --- | ----- | ----- |
|     |       |       |

## 8. Adaptation

How the page looks and behaves in the dark theme and on narrow screens (375px).

## 9. Acceptance criteria

Each one must be checkable by an action or a screenshot:

- [ ] D1 …
- [ ] D2 …

When the design changes, keep existing numbers unchanged and append new criteria at the end.

## 10. Open questions

Points the user needs to decide; if there are none, write "None".

## 11. Change log

Record here any changes made after the design was confirmed.

| Date | Change | Reason | Affected acceptance criteria | Confirmed by the user |
| ---- | ------ | ------ | ---------------------------- | --------------------- |
|      |        |        |                              |                       |

## 12. Guideline trade-offs

Give a reason for each Should guideline you do not adopt; where a Must guideline leaves room for interpretation, write down how you read it; deliberate fixed sizes (F7) also go here.

| Guideline | Level | Handling | Notes |
| --------- | ----- | -------- | ----- |
|           |       |          |       |

## 13. Review responses

Record how each comment from the design review (`review-design.md`) was handled, and cover them when you ask the user to confirm the design.

| ID  | Type                  | Handling                                                | Where changed |
| --- | --------------------- | ------------------------------------------------------- | ------------- |
|     | Blocking / Suggestion | Changed / Not adopted (reason) / For the user to decide |               |
