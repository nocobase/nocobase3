---
title: 'Review AI Agent output'
description: 'Check behavior, code changes, and project checks before accepting AI Agent-generated work.'
---

# Review AI Agent output

When your AI Agent says it is done, walk through the requirement. A visible page is only the beginning: verify persistence, restrictions, and whether the application builds.

## Use it as a user

For the [first order feature](../get-started/first-feature.md):

1. Sign in and open the order list from the menu.
2. Create an order and check the displayed values.
3. Refresh and confirm it remains.
4. Edit the amount, save, and refresh again.
5. Try a duplicate order number and a negative amount; both should be rejected.

![Persisted order after editing and refreshing; interface shown in Chinese](https://static-docs.nocobase.com/nb3-docs-20260916-orders-cn.png)

For permission requirements, switch accounts. Administrator access does not prove ordinary users have the correct data scope, and hidden buttons do not replace API authorization.

## Review the scope of changes

Ask your AI Agent to list new and changed files. If the project already uses Git:

```bash
git status --short
git diff
```

`git diff` does not include untracked new files, so inspect both. Confirm that pages, APIs, and database changes fit together, unrelated features remain intact, and configuration secrets are not included in commits.

For migrations, check that existing data is preserved. Do not rebuild a database just to fix a field. Correct merged migrations through new migrations; see [schema changes](../app/migrations.md).

## Run the project's checks

Inspect `scripts` in the application's `package.json`. The default template provides:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

| Check       | What it can find                                                 |
| ----------- | ---------------------------------------------------------------- |
| `typecheck` | Type, import, and API declaration mismatches                     |
| `test`      | Failures in behaviors covered by existing tests                  |
| `lint`      | Project-rule violations and some code issues                     |
| `build`     | Client/server build failures and missing deployment dependencies |

`pnpm check` runs lint, formatting, types, tests, and the build in sequence. A successful command does not prove all business behavior: `pnpm test` may succeed when no test files exist. Still verify actual interactions.

For example, a page may work during development while server dependencies are listed only in `devDependencies`, causing deployment to fail. Build checks help catch this problem.

## Return specific feedback

Describe the action, expectation, and actual result:

```text
I created ORD-001 and saw it in the list after saving.
It disappeared after refreshing the browser.
I expected it to remain.
Please check whether the page calls the save API and whether the API writes to the database.
After fixing it, verify creation, refresh, and editing, and report the actual results.
```

For terminal failures, include the working directory, command, and full error. Exclude secrets, real customer information, and credential-bearing configuration.

If your AI Agent proposes removing a check, forcing a type conversion, or resetting the database, ask for the reason and impact. Fix the cause and recheck existing behavior.

## Keep a record of the round

Record verified behavior and remaining issues before continuing. See [complex features](./complex-features.md) for a step-by-step approach.
