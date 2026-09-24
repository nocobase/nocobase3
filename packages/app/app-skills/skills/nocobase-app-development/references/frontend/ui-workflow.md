# Frontend development workflow

This is the entry point for the application's frontend work: read it before writing or changing anything under `client/` — pages, components, styles or copy. It covers only which workflow to follow, what to do at each step, and what counts as done. It says which changes take the full workflow (write a design file and review it once, then run one independent acceptance review after development), which can be a quick change (edit directly and run static checks only), and which parts of `ui-guidelines.md` and `frontend-dev.md` to read at each step. What the interface should look like is in `ui-guidelines.md`; how to write the code is in `frontend-dev.md`. Paths in this document are relative to its own directory: `ui-guidelines.md` and `frontend-dev.md` sit beside it, the topic references are under `references/`, and the record templates are under `templates/`.

## Choosing a workflow

Decide before you start, and say in one sentence in your reply which workflow you are following and why.

| Workflow      | When it applies                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full workflow | Any one of: a new page; a new complete interaction (a create/edit flow, a detail drawer, a multi-step operation); a change to the page structure or main interactions; one change that touches the UI of several pages; the user asks to see the design first |
| Quick change  | None of the above applies. For example: changing copy; adjusting styling details; adding a button, a column, a form field or a filter to an existing page; fixing a UI bug; a refactor that changes neither appearance nor behavior                           |

When unsure, explain the difference in one sentence (the full workflow adds a design, a design review and an independent acceptance review) and let the user choose.

## Quick change

1. Read `frontend-dev.md` and the references under `references/` related to the change. When the change affects how the interface looks or behaves, also read the relevant guidelines in `ui-guidelines.md`, and at minimum check the relevant items of the "Review checklist" at its end.
2. Follow how the page is already written: keep components, spacing and copy style consistent with what surrounds the change.
3. Run static checks on the changed files only: `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm exec eslint --max-warnings 0 <files>`, `pnpm exec prettier --check <files>`.
4. Report what you changed and which checks you ran.

A quick change does not test in a browser, run test cases, write a design file or a run record, or start a reviewer subagent. If partway through you find the change goes beyond a quick change (for example, it needs a new interaction or a change to the page structure), stop, explain the situation, and switch to the full workflow.

## Full workflow

Five steps: design → design review → development → acceptance review → report. The design review and the acceptance review each happen once; there is no loop.

### Roles

- **Main agent**: writes the design, writes the code, fixes issues.
- **Reviewer**: a new subagent (with its own context) for the design review, and another for the acceptance review. Give it only the guidelines, the design file, the screenshots, the run record and the changed files — not your reasoning. The reviewer only reports issues and does not modify files. If the environment does not support subagents, re-read everything from the files and do the review yourself as a separate pass, and mark the record "Non-independent review".
- **User**: confirms the design and has the final say on design changes.

### Artifacts

Everything goes in `storage/ui-workflow/<feature>/` (`storage/` is ignored by git). `<feature>` is kebab-case and matches the route name:

| File                           | Contents                                                                                         | Template              |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------- |
| `design.md`                    | Design file                                                                                      | `templates/design.md` |
| `review-design.md`             | Design review record (written by the reviewer)                                                   | `templates/review.md` |
| `run.md`                       | Run record (written by the main agent)                                                           | `templates/run.md`    |
| `acceptance.md`                | Acceptance record (the reviewer writes the issues; the main agent writes the fixes and rechecks) | `templates/review.md` |
| `capture.json`, `screenshots/` | Screenshot configuration and acceptance screenshots                                              | —                     |

These files are used only while the task is in progress: the reviewer and the main agent hand work over through them, and the report is compiled from them. Delete all of them when the task ends (step 5), including `design.md`: once the page is implemented, the code is the authority on how it was designed, and a leftover document only goes stale.

### Step 1: Design

1. Read all of `ui-guidelines.md` and `templates/design.md`; then read `frontend-dev.md` and the references under `references/` relevant to this page (usually page, overlay, form, table and api; add child-routes when there are child pages or tabs), and confirm that the routes, permissions, overlays and way of updating data in the design can all be implemented.
2. Work out the data:
   - The endpoint exists: read its implementation or documentation, and copy its fields, parameters, response shape and error codes into the design.
   - The endpoint does not exist: specify the endpoint you need in the design; the backend is implemented to that contract.
3. Take stock of the available components: `client/components/ui/` (primitives) and `client/components/` (compositions). The design uses only existing components or components the shadcn registry can add; if it needs a new component, say so in the design. Open the source to confirm any component behavior the design depends on (default width, footer button alignment, how tables paginate and sort, overlay nesting); the file name alone is not enough.
4. Write `design.md` from the template: choose a page template (guidelines T1–T4), draw a wireframe, and list the components, states, interactions and copy.
5. Write the acceptance criteria, numbered D1, D2, …, each one checkable by an action or a screenshot; step 4 checks them one by one. When the design changes later, keep existing numbers unchanged, append new criteria at the end, and mark removed ones "Deleted", so that references in the review records still match.

When done, set the status in `design.md` to "Pending review".

### Step 2: Design review (once)

1. Start a new subagent and review with the "Design review prompt" below; the record goes in `review-design.md`. Issues are classified as blocking or suggestion and cite guideline IDs.
2. If there are blocking issues: revise the design, and record how each issue was handled in the design's "Review responses" section (give a reason for each suggestion you do not adopt). There is no second review.
3. Ask the user to confirm: in a few sentences, summarize the page structure, the main interactions, the issues the review found and how they were handled, and the questions awaiting the user's decision, and include the path to `design.md`.
   - Once the user confirms, set the status to "Confirmed" and move on to development.
   - If the user has already said explicitly not to wait for confirmation and to finish in one go: record that in `design.md`, continue with development, and summarize the design in the final report so it can be confirmed afterwards.

The confirmed design is the basis for development and the acceptance review.

### Step 3: Development

1. Read `frontend-dev.md` first, then the references under `references/` for each topic involved.
2. Implement according to `design.md`: every item in the component list, every state, every interaction and every piece of copy must have a matching implementation.
3. When new backend endpoints are needed, implement them to the endpoint contract in the design (for backend code, see `../server-routes.md`, `../migrations.md` and `../database-and-data.md`).
4. When the design contains decisions that the code does not show by itself but that anyone changing this page later needs to know (for example, why an approach was not used, or what limits an endpoint has), write them as code comments. `design.md` is deleted when the task ends.
5. Move on to step 4 only after every self-check passes:
   - Type checking: `pnpm exec tsc -p tsconfig.json --noEmit`; if you changed server or database code, also run `pnpm exec tsc -p tsconfig.server.json --noEmit`
   - Changed files only: `pnpm exec eslint --max-warnings 0 <files>`, `pnpm exec prettier --check <files>`
   - Related tests: `pnpm exec vitest run <files>`. When you add a page that requires sign-in (including child routes), add its route name to the page grant list in `tests/logic/client-routes.test.ts` (see section 12 of `references/page.md`); cover the page's key behavior (state changes, submission, error handling) with component tests in `tests/components/`, written as described in `references/testing.md`
   - `tests/` is outside the scope of every tsconfig, so only ESLint covers test files; after writing tests, confirm they actually run and pass

If you find during development that the design is not feasible, follow "Design changes".

### Step 4: Acceptance review (once)

#### 4.1 Run check (main agent)

1. If the application is running, reuse it; if not, start it. Open the page in a browser. If the page requires sign-in and there is no sign-in session, ask the user to sign in themselves; do not enter a password for the user.
2. Prepare data: take a screenshot of the "empty" state first, then create enough test data through the UI or the endpoints (covering the different statuses, empty fields, long text and pagination). When the checks change data, note how you prepared it and how to clean it up.
3. First capture a baseline on an existing page (for example, the homepage): console errors already present in the baseline come from the application shell; record them as "Already in baseline" — they are not issues of this feature. When a new page pulls in a dependency for the first time, Vite re-runs dependency pre-bundling, and a few 404s for `/.vite/deps/` may appear; they disappear after a reload and are not page issues either.
4. Following the interactions in `design.md` one by one, walk through the core flow (for example, create → appears in the list → edit → delete), and cover every state: loading, empty, no results, failure.
   - Type text character by character (`keyboard.type`), and edit in the middle of existing text; for search boxes and form text fields, also simulate Chinese IME composition. Filling in a value in one go (`fill`) cannot reveal an input falling out of sync with its state.
   - For results a screenshot cannot show, such as where focus goes, whether a button is disabled, or how many requests are sent, write Playwright script assertions (put them under `storage/ui-workflow/<feature>/`).
   - Simulate failure states by making requests fail (`block`); `offline` cuts Vite's hot update connection, and the page does a full reload when the network comes back.
   - Record any state you cannot simulate as "Not verified" and give the reason.
5. Record console errors, failed endpoint requests (4xx, 5xx, except those the check caused on purpose) and page errors.
6. Screenshots: one per key state, saved to `screenshots/`, with file names matching those referenced in the acceptance criteria. `scripts/capture.mjs` can take them in batch, and it collects console errors and failed requests at the same time.
7. Write the run record `run.md` from `templates/run.md`.

#### 4.2 Independent review (new subagent)

Use the "Acceptance review prompt" below; the record goes in `acceptance.md`. The reviewer sorts issues into four types:

| Type                  | Meaning                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B Blocking            | Unusable: a blank screen or an error, the core flow cannot be completed, data is not saved or is saved wrongly, an action gives no feedback, console errors, access beyond permissions (seeing or changing data that should not be visible) |
| D Design mismatch     | Checked one by one against D1…Dn in `design.md`, any criterion that does not pass                                                                                                                                                           |
| G Guideline violation | Violates a guideline marked Must in `ui-guidelines.md`                                                                                                                                                                                      |
| S Suggestion          | Anything else that could be improved                                                                                                                                                                                                        |

#### 4.3 Fixes and rechecks (main agent)

- Only S issues, or no issues: the acceptance review passes. You may fix S issues along the way; list the ones you do not fix in the report.
- B, D or G issues: fix all of them, then recheck them yourself; do not start a second reviewer:
  1. Rerun the self-checks from step 3.
  2. Exercise each fix again, one at a time, along with the flows related to it: a fix can introduce new issues — for example, if you changed the save logic, walk through create, edit and delete again.
  3. Retake the screenshots whose view has changed.
  4. In the "Fixes and rechecks" section at the end of `acceptance.md`, record for each issue how you fixed it, how you rechecked it, and the result.
- Issues you cannot fix, or that need a design change: follow "Design changes", or list them in the report as outstanding, with the reason.

### Step 5: Report

The final report includes:

- **What was done**: pages, routes, changed files.
- **Design**: whether the user has confirmed it; the list of design changes.
- **Acceptance review**: which issues the review found; the results of the fixes and rechecks.
- **Screenshots**: send the key screenshots to the user directly, not just their paths.
- **Outstanding**: unresolved issues, and what was not verified and why.

Cleanup: after sending the screenshots to the user, delete the whole `storage/ui-workflow/<feature>/` directory and the sign-in session `storage/ui-workflow/auth.json`, and state at the end of the report that you cleaned up. Skip this when the user asks to keep them.

### Design changes

When development or the acceptance review shows that the design is not feasible (endpoint limits, something a component cannot do, conflicting interactions), or that it needs adjusting:

1. Pause development of the affected parts.
2. In the "Change log" of `design.md`, record what changed, why, and which acceptance criteria it affects.
3. For a small change (one that does not affect the page structure or the main interactions), record it and continue, and list it in the final report; for a large change, ask the user to confirm first.

Do not implement a design you know is flawed just to "match the design", and do not deviate from the design without leaving a record.

## Screenshot tool

`scripts/capture.mjs` uses Playwright to open pages, perform actions and take screenshots according to a configuration, and writes console errors, page exceptions and 4xx/5xx requests to `screenshots/capture-log.json`. Run it from the application root:

```bash
# 1. Save the sign-in session: a browser window opens, the user signs in themselves, and the script never touches the password
node .agents/skills/nocobase-app-development/references/frontend/scripts/capture.mjs login --base http://localhost:13000/main

# 2. Take screenshots from the configuration
node .agents/skills/nocobase-app-development/references/frontend/scripts/capture.mjs shoot --spec storage/ui-workflow/<feature>/capture.json
```

The sign-in session is saved to `storage/ui-workflow/auth.json` (`storage/` is ignored by git). Do not commit or share it, and delete it when the task ends. For `--base`, use the address the application is actually served at (including the deployment base path); the `base` used for screenshots must be on the same host as the one used to sign in (sign-in sessions for `localhost` and `127.0.0.1` are not interchangeable). `login` waits 10 minutes by default; extend it with `--timeout <minutes>`.

Example configuration:

```json
{
  "base": "http://localhost:13000/main",
  "out": "storage/ui-workflow/projects/screenshots",
  "locale": "zh-CN",
  "shots": [
    { "name": "list", "path": "/projects" },
    { "name": "dark", "path": "/projects", "colorScheme": "dark" },
    {
      "name": "mobile",
      "path": "/projects",
      "viewport": { "width": 390, "height": 844 }
    },
    {
      "name": "create-dialog-errors",
      "path": "/projects",
      "steps": [
        { "click": "role=button[name='新建项目']" },
        { "click": "role=button[name='保存']" }
      ]
    }
  ]
}
```

At the top level, the configuration can set `base`, `out`, `locale`, `viewport`, `colorScheme` and `hide` (elements hidden in screenshots; by default the development toolbar `#agent-annotations-root` is hidden). Each shot can set:

| Field                                           | Description                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `path`                                          | Path within the application, for example `/projects?status=active`                   |
| `setup`                                         | Steps run before the page opens; suited to `delay` and `block`                       |
| `steps`                                         | Steps run after the page opens                                                       |
| `waitUntil`                                     | What to wait for when opening the page; defaults to `networkidle`                    |
| `viewport`, `colorScheme`, `locale`, `fullPage` | Viewport, light or dark theme, language, whether to capture the full page            |
| `settle`                                        | Milliseconds to wait before the final screenshot; defaults to 500                    |
| `screenshot`                                    | When `false`, no screenshot is taken at the end (only mid-flow screenshots are used) |

Steps:

| Step                     | Effect                                                                      |
| ------------------------ | --------------------------------------------------------------------------- |
| `click`, `fill`, `press` | Click, fill in (`[selector, value]`), press a key                           |
| `waitFor`, `wait`        | Wait for an element to appear; wait a fixed number of milliseconds          |
| `goto`                   | Go to another path within the application in the same shot                  |
| `offline`                | `true` goes offline, `false` comes back online                              |
| `block`, `unblock`       | Make matching requests fail / stop doing so, for example `**/api/projects*` |
| `delay`                  | `{ "url": "...", "ms": 3000 }`: delay responses to matching requests        |
| `screenshot`             | Take a screenshot mid-flow; the value is the file name                      |

- To capture the loading state: use `setup` to delay only the page's own data endpoint, and set `waitUntil` to `domcontentloaded`. Do not delay `**/api/**`: the application shell is also waiting on the session endpoint, and you would capture a blank page.
- To capture the failure state: use `block` to make the data endpoint fail, or use `offline`.
- `--only list,dark` runs only the named shots.
- If Playwright's bundled browser is not installed, the script uses the local Chrome instead.

Screenshots do not replace hands-on testing: you still walk through every interaction flow.

## Design review prompt

Copy it and replace the parts in angle brackets:

```text
You are a UI design reviewer. You only review: do not modify any file other than the review record.

Read:
- UI guidelines: .agents/skills/nocobase-app-development/references/frontend/ui-guidelines.md
- Design file: storage/ui-workflow/<feature>/design.md
- Review record template: .agents/skills/nocobase-app-development/references/frontend/templates/review.md
- Available components: the file listings of client/components/ui/ and client/components/

Check each point:
1. Whether the design meets every guideline marked Must. Go through the "Review checklist" at the end of the guidelines item by item, and cite guideline IDs in issues.
2. Whether the choice of page template and overlays follows sections T and I of the guidelines.
3. Whether the states (loading, empty, no results, failure, submitting) are complete, and whether what each state shows is clearly specified.
4. Whether the interactions are specific enough to implement directly: the trigger, the result, and what happens on success and on failure.
5. Whether all copy has both Chinese and English; whether the wording of buttons and titles follows section C of the guidelines.
6. Whether the acceptance criteria cover the main interactions and states, and whether each one can be checked by an action or a screenshot.
7. Whether the design uses components that do not exist in the project and cannot be added from shadcn.

Classify issues as "Blocking" (a Must guideline is not met, a state or interaction is missing, or something cannot be implemented) or "Suggestion".
Write the record to storage/ui-workflow/<feature>/review-design.md following the template, and fill in its verdict line with "Verdict: Pass" or "Verdict: Fail".
```

## Acceptance review prompt

```text
You are a UI acceptance reviewer. You only review: do not modify any file other than the acceptance record.

Read:
- Design file: storage/ui-workflow/<feature>/design.md
- UI guidelines: .agents/skills/nocobase-app-development/references/frontend/ui-guidelines.md
- Record template: .agents/skills/nocobase-app-development/references/frontend/templates/review.md
- Screenshots: every image under storage/ui-workflow/<feature>/screenshots/ (look at each one)
- Run record: storage/ui-workflow/<feature>/run.md
- Changed files: <file list>

Additional verification: when the screenshots and records are not enough to decide, you may check for yourself with the screenshot tool or a read-only Playwright script (put scripts and output under storage/ui-workflow/<feature>/; do not create, modify or delete data; do not print cookies). Focus on what the run record does not cover, such as typing character by character, Chinese IME input and where focus goes.

Check each point:
1. B Blocking: judge from the run record and the code whether the core flow works. Console errors (except those already in the baseline), failed requests (except those the check caused on purpose), actions without feedback, missing error handling and unreliable input all count.
2. D Design conformance: go through the acceptance criteria in design.md one by one, and give each one "Pass / Fail / Not verified" with evidence (a screenshot file name or a code location).
3. G Guidelines: check the Must guidelines against the "Review checklist" at the end of the guidelines.
4. S Suggestions: anything else that could be improved.

Write the record to storage/ui-workflow/<feature>/acceptance.md following the template, and fill in its verdict line with "Verdict: Pass" (no B, D or G issues) or "Verdict: Fail". Leave the "Fixes and rechecks" section empty; the main agent fills it in.
```
