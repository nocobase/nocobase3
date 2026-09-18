---
title: 'Add team conventions'
description: 'Keep stable project requirements in the application so AI Agent work follows consistent guidance.'
---

# Add team conventions

When you repeat a requirement in every conversation, consider adding it to the project instructions. Examples include currency units, interface terminology, and the behaviors to verify after a change.

## Preserve existing guidance

The NocoBase template already includes `AGENTS.md` and development guidance explaining pages, APIs, and database code. Ask your AI Agent to read it and add team requirements in the appropriate place. Do not replace it with a short new file.

AI Agents may load instructions differently. Explicitly request that the relevant files be read and verify the resulting behavior; a file's existence alone does not prove it was followed.

## Write actionable, checkable rules

Adapt this example to your application:

```md
## Order conventions

- Display amounts in currency units with two decimals; store integer cents in the database.
- Use “customer” consistently in the interface.
- Order numbers must be unique; validate non-negative amounts on both client and server.
- After changing order persistence, verify creation, editing, and browser refresh.
- Keep secrets and real customer information out of logs, example data, and committed files.
```

“Write good code” and “make it beautiful” are hard to assess. Name the component system, business terms, and behaviors that matter.

## Keep scope clear

Put application-wide requirements at the root. Put local rules in the relevant directory's instructions and explain their scope. The template's `client/AGENTS.md` and `server/AGENTS.md` describe their respective areas.

Conventions do not replace feature requirements. “Store amounts as integer cents” can be permanent; “finish the list today” is task progress and belongs elsewhere.

## Verify with a small change

After adding a rule, ask your AI Agent to make a small change, such as displaying an order amount. Check its terminology, amount handling, and actual verification.

If it does not follow the rule, first check whether it read the file and whether the wording is ambiguous. Adjust and verify again instead of adding stronger prohibitions.

## Maintain conventions with the project

When business rules or directories change, update the instructions and retain the reason. The next person and AI Agent need to understand why the project works that way.

See [complex features](./complex-features.md) for task breakdown and [reviewing output](./reviewing-output.md) for verification.
