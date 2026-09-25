# UI guidelines

These are this application's UI design guidelines: foundations, page structure, page templates (list, detail, form, settings), interaction choices, data freshness, states, copy, accessibility and adaptation. They define what the interface should look like, not how to write the code (for that, see `frontend-dev.md`). Every rule has an ID and is marked Must or Should. Use them to design pages, review designs and review implementations. When you design or review a UI in the full workflow, read the whole document; for a quick change, read the items related to the change.

## How to use

- **When designing**: first choose a page template from section T, then satisfy the rules section by section.
- **When reviewing**: go through the review checklist at the end item by item, and cite rule IDs in issues, for example "violates T1.4".
- An unmet rule marked Must is an issue. When you do not adopt a rule marked Should, give the reason in the design file's "Guideline trade-offs" section.
- For a situation the guidelines do not cover: follow the closest rule, and record the situation under "Open questions" in the design file.
- **Scope**: the rules govern the UI a page adds itself. Parts that come with shared components (the × in a dialog's top-right corner, pagination buttons, table header menus and so on) keep the component's default behavior. When they need to change, modify the shared component so every page changes together; do not build a separate version in a single page.

## F Foundations

**F1 [Must] Color uses only semantic tokens**; do not write literal color values:

| Purpose                                    | Use                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| Page background                            | `bg-background`                                         |
| Cards, panels                              | `bg-card`                                               |
| Muted areas, secondary backgrounds         | `bg-muted`                                              |
| Overlays (dialogs, menus)                  | `bg-popover` (built into the components)                |
| Body text                                  | `text-foreground`                                       |
| Secondary text, descriptions, placeholders | `text-muted-foreground`                                 |
| Borders, dividers                          | `border-border`                                         |
| Primary actions                            | The default button style (`bg-primary`)                 |
| Destructive                                | `text-destructive`; buttons use `variant='destructive'` |

Do not use literal colors such as `bg-white`, `text-gray-500`, `#1677ff` or `rgb(…)`.

**F2 [Must] Font sizes come from the scale**: PageHeader provides the page title; section titles use `text-base font-medium`; body text, tables and forms use the components' default size (`text-sm`); helper text uses `text-sm text-muted-foreground` or `text-xs`. Do not use arbitrary values such as `text-[13px]`.

**F3 [Must] Spacing comes from the scale**: `gap-6` between sections (PageContainer already provides it); `p-4` or `p-6` padding inside cards; `gap-2` between related controls; FieldGroup's default spacing between form fields. Do not use arbitrary values such as `mt-[7px]`.

**F4 [Must] Radius and shadow use the component defaults**; when you need a custom one, use only utility classes such as `rounded-lg` and `shadow-sm`.

**F5 [Must] All icons come from lucide-react**; the button controls the size of an icon inside it, and a standalone icon uses `size-4`.

**F6 [Must] Everything is clearly readable in both the light and dark themes**. Using only semantic tokens satisfies this automatically; you do not need `dark:` prefixes.

**F7 [Must] Explain intentional fixed sizes**: where a fixed value is genuinely needed, such as a control width, a viewport-relative maximum height or an image size, you may use a literal value, but record it in the design file's "Guideline trade-offs" section. This exception does not apply to color, font size or spacing.

## L Page structure

**L1 [Must]** A business page is wrapped in PageContainer, with a PageHeader at the top: a title (required), a one-sentence description (recommended) and page-level actions (on the right).

**L2 [Must]** A view (page, dialog, drawer) has at most one primary button (the default style); other buttons use outline, ghost or destructive, or go into a menu.

**L3 [Should]** The page title matches the navigation menu name and is a noun ("Customers"), not a verb phrase.

**L4 [Should]** List and table pages use the full width; pages mainly for forms or reading limit the content width (`max-w-2xl` to `max-w-4xl`) so inputs do not get too long.

**L5 [Must]** Page-level actions go on the right of the PageHeader; actions on a single record go in that record's row or detail view; bulk actions appear only after records are selected.

## T Page templates

### T1 List page: browse, find and manage one kind of record

Structure, top to bottom: PageHeader (primary action "New X") → toolbar (search box and filters on the left, secondary actions on the right) → table → pagination.

- **T1.1 [Must]** The search box has a placeholder that says which fields it searches, for example "Search by name or email".
- **T1.2 [Must]** Filter controls show their current value; while a search or filter is applied, show "Clear filters".
- **T1.3 [Must]** The first column is the record's name or number; when there is a detail view, clicking it opens the detail view.
- **T1.4 [Must]** Enumerated values such as status and type are shown as text in a Badge; color is only an aid, and values must never be distinguished by color alone.
- **T1.5 [Must]** Row actions go in a "More" menu at the end of the row (a ⋯ icon button); the most common one may be shown directly in the row. Delete goes last in the menu, in the destructive style, separated from the other items by a divider.
- **T1.6 [Must]** Dates and times are formatted for the current language; numbers and amounts are right-aligned, with thousands separators.
- **T1.7 [Should]** Search and filter conditions are written to the URL, so they survive a refresh and going back.
- **T1.8 [Should]** Sortable columns show their sort state in the header; the default order is by last update time, newest first.
- **T1.9 [Must]** A list page must have a design for all four states S1–S4.
- **T1.10 [Must]** When the endpoint caps the number of results and does not return a total, show a notice when the results reach the cap ("Only the first N records are shown. Use search or filters to narrow the results."); records beyond the cap must not silently disappear.

### T2 Detail view

- **T2.1 [Must]** With few fields (about 15 or fewer) and no sub-tables, show the details in a right-side drawer; with multiple sections, sub-tables or a need for tabs, use a separate page.
- **T2.2 [Must]** The top of the drawer or detail page shows the record name. Actions on the record (edit, delete) sit in a fixed position at the top or the bottom, grouped together, not one on the left and one on the right.
- **T2.3 [Must]** The detail view can be opened directly by URL, and a refresh still shows the same record (see I6).
- **T2.4 [Must]** Fields are laid out in two columns, "label — value", and an empty value shows "—"; multi-line text keeps its line breaks; very long values (emails, URLs) may wrap and must not break the layout.

### T3 Form: create and edit

- **T3.1 [Must]** Choosing the container: with at most 8 fields and no complex dependencies between them, use a dialog; with more fields, or when the form needs groups or steps, use a separate page or a wider drawer.
- **T3.2 [Must]** Labels sit above inputs; a required field gets a `*` after its label, and an optional field gets no mark.
- **T3.3 [Must]** Validation timing: validate a field when it loses focus, and all fields on submit. Errors appear below the field and say what is wrong and how to fix it ("Enter an email address", "The email format is invalid"); when submission fails, focus moves to the first field with an error.
- **T3.4 [Must]** Dialog footer buttons are right-aligned: "Cancel" and then the submit button, from left to right; on narrow screens they stack vertically as the component does by default (submit button on top). The submit button names the specific action ("Create", "Save"), not "OK" or "Submit".
- **T3.5 [Must]** While submitting: the submit button shows a loading state and is disabled, the cancel button is disabled too, and the dialog cannot be closed, to prevent duplicate submissions.
- **T3.6 [Must]** Field errors returned by the server appear below the corresponding fields; other failures appear in an Alert at the top of the form. On failure, do not close the form or clear the input.
- **T3.7 [Must]** On success, close the dialog, update the related data (see R2) and state the result in a toast (`Created customer "Zhang San"`).
- **T3.8 [Must]** When an edit form opens, it loads the record's latest data before prefilling the fields; it does not use data from the list or detail view directly, since that data may be stale. Show a skeleton while loading; handle a load failure or a missing record as S4 and R3 describe.
- **T3.9 [Should]** A form with many fields asks for confirmation when it is closed with unsaved changes.

### T4 Settings page

- **T4.1 [Must]** Split the page into Cards by topic; each Card has a title and a one-sentence description.
- **T4.2 [Must]** Each Card is saved on its own, with its save button at the bottom right of the Card.
- **T4.3 [Must]** A toggle setting takes effect as soon as it is switched and shows a toast; a setting that needs input takes effect when Save is clicked.

### Page types not covered

Dashboards, kanban boards, calendars and similar pages have no template yet. When designing one, follow the rules in sections F, L, I, R, S, C and A, and explain in the design file why you chose its structure.

## I Interaction choices

**I1 [Must] Choosing an overlay**:

| Scenario                                        | Use                                                            |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Confirming an action                            | AlertDialog                                                    |
| Short form (create, edit, ≤ 8 fields)           | Dialog (child route, can be opened directly by URL)            |
| Viewing record details                          | Right-side drawer (child route, can be opened directly by URL) |
| Long form, multiple steps, complex details      | Separate page                                                  |
| A few options, filter conditions, quick actions | DropdownMenu or Popover                                        |

Stacking rules: a drawer can open a dialog (for example, to edit from the detail view) and a confirmation dialog; a dialog can open only a confirmation dialog on top of it. Esc and clicking the backdrop close only the topmost layer.

**I2 [Must] Confirm destructive actions first**: deleting, disabling, clearing, revoking access and similar actions open an AlertDialog first. The title names the object (`Delete customer "Zhang San"?`), the description states the consequence ("This cannot be undone"), and the confirm button uses the destructive style, with a label naming the specific action ("Delete").

**I3 [Must] How to give feedback**:

| Situation                                                                                              | Method                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| An action succeeds                                                                                     | A toast stating the result in one sentence              |
| Form validation fails                                                                                  | Inline errors below the fields, not a toast             |
| A request in a dialog fails                                                                            | Show the error inside the dialog; the dialog stays open |
| Page data fails to load                                                                                | An error state in the page (S4)                         |
| A single-click action without a dialog fails (such as "Mark as done"), or a background operation fails | An error-style toast                                    |

Do not show raw backend error messages (untranslated exception messages, stack traces, SQL) to the user.

**I4 [Must] Loading indicators**: the first load shows a skeleton (S1); an action triggered by a button shows its loading state on that button; a reload (search, refresh) keeps the old data and shows a lightweight loading indicator instead of replacing the whole block with a skeleton.

**I5 [Should]** The search box searches automatically as the user types (debounced by about 300ms), without the user pressing Enter.

**I6 [Must] URL-addressable state**: create and edit dialogs and detail drawers each have their own URL, so a link opens them directly, a refresh restores them, and the browser's back and forward buttons open and close them. Only a confirmation dialog for a single action and a temporary panel stay out of the URL.

**I7 [Must]** Actions the user has no permission for are not shown; actions that are temporarily unavailable are disabled, with a tooltip explaining why.

**I8 [Must]** Every action can be completed with the keyboard: when a dialog opens, focus moves into it, Esc closes it, and Enter submits the form. The components have these behaviors built in; do not break them.

## R Data freshness

**R1 [Must] Never write from stale data**: edit, delete and similar actions work from the record's latest data (see T3.8). Take particular care when the backend replaces fields wholesale; otherwise the write overwrites changes that someone else, or the same user, just made.

**R2 [Must] Update immediately after a successful write**: update the current view (detail view, drawer) at once with the data the endpoint returns, then refresh the list; the UI must never end up in a state where "the toast says it was saved, but the UI still shows the old value". While refreshing, keep the old data and show that it is loading, as I4 requires.

**R3 [Must] The record no longer exists**: when editing, deleting or opening the details reveals that the record has been deleted (404), say "This record does not exist or has been deleted" and give a next step (close the overlay, go back to the list); the list refreshes as well. Do not let the user repeat an action that is bound to fail, and do not offer "Retry".

## S States

- **S1 [Must] Loading**: a skeleton shaped like the real content (skeleton rows for a table, "label — value" skeletons for a detail view), with the accessible name "Loading".
- **S2 [Must] Empty** (no data at all yet): use the Empty component, with an icon, a title ("No customers yet"), a description (what the user can do next) and an action button ("New customer"). When the page header already has the same primary action, the button in the empty state uses the outline style, so the view keeps only one primary button (L2).
- **S3 [Must] No results** (a search or filter is applied but nothing matches): keep it distinct from S2, say that nothing matches, and offer "Clear filters".
- **S4 [Must] Load failed**: show a destructive-style Alert in the page that explains the situation according to the error type. For temporary problems such as network errors and server errors, offer "Retry"; for problems a retry cannot fix, such as missing permission or a record that does not exist, explain the situation and the next step without offering "Retry" (for a missing record, see R3).
- **S5 [Must] Submitting, deleting**: see T3.5 and I2; the button shows a loading state and is disabled.
- **S6 [Must] No access**: the application shell handles a whole page the user cannot access, so the page needs no design of its own for that case; when the user may not view one block of data on a page, show an explanation there instead of leaving it blank.

## C Copy

- **C1 [Must]** All user-visible text has both a Chinese and an English translation, including aria-labels, placeholders, toasts and validation messages.
- **C2 [Must]** Use the same word for the same concept across the whole application (do not mix "customer" and "client", or "客户" and "顾客").
- **C3 [Must] Button copy**:
  - Page-level actions use "verb + object" ("New customer"; 新建客户 in Chinese).
  - Buttons in a record's context (row menu, bottom of the detail drawer) and buttons in dialogs use only the verb ("Edit", "Delete", "Create", "Save"); the context already identifies the object.
- **C4 [Must]** An empty state says "where things stand + what to do next"; an error says "what happened + what to do about it", without blaming the user.
- **C5 [Should]** Keep copy short: a description is one sentence, and a toast is at most 20 Chinese characters (about 12 English words), not counting the record name.
- **C6 [Must]** When copy refers to a specific record, include the record's name (`Deleted customer "Zhang San"`; in Chinese, `已删除客户“张三”`). Chinese wraps the name in “”; English wraps it in "…".
- **C7 [Must] Overlay titles**: dialog and confirmation dialog titles use "verb + object", with the same verb as the button that opens them (the "Edit" button opens "Edit customer", and the "New customer" button opens "New customer"); a confirmation dialog title also includes the record name (I2).

## A Accessibility and adaptation

- **A1 [Must]** Icon buttons have an accessible name (aria-label); an icon button that performs an action on its own gets a tooltip; a "More" button that opens a menu needs no tooltip.
- **A2 [Must]** Do not convey information by color alone: states have text, and errors have a text explanation.
- **A3 [Must]** Keep a visible focus style, and keep it consistent across links, buttons and inputs.
- **A4 [Must]** Usable at a width of 375px: the toolbar wraps, tables can scroll horizontally, dialogs stay within the screen (when the content is too long, the dialog scrolls internally and its footer buttons stay reachable), buttons are not covered, and long text does not break the layout.
- **A5 [Must]** Text-to-background contrast meets WCAG AA. Semantic tokens meet it by default; custom colors must be verified.
- **A6 [Must] Where focus goes**: when an action removes the element that has focus (deleting a row, closing a drawer, a record that no longer exists), move focus to a stable place (such as the search box or the page title); do not let focus fall to the top level of the page.
- **A7 [Must] Reliable input**: text boxes support Chinese input methods (IME composition), typing character by character, and editing in the middle of the text; while the user is typing, external state (the URL, endpoint responses, auto-refresh) must not overwrite or interrupt the text box's content.
- **A8 [Should]** Informational messages (such as the result cap notice) do not use alert semantics, which interrupt screen reader announcements; use those only for errors.

## Review checklist

The design review and the acceptance review both go through this checklist item by item; record each unmet item in the review record and cite its IDs:

- [ ] The page template and overlay choices are correct, and stacking follows the rules (T1–T4, I1)
- [ ] Page structure: PageContainer, PageHeader, one primary button per view, actions in the right places (L1, L2, L5)
- [ ] All states are covered: loading, empty, no results, load failed, submitting; whether a failure offers a retry follows S4 (S1–S5)
- [ ] List: search placeholder, filters and clearing them, first column, enum Badges, row actions, formatting, result cap notice (T1.1–T1.6, T1.10)
- [ ] Form: container, labels and required marks, validation timing, button order and copy, submitting, failure, success, loading the latest data before editing (T3.1–T3.8)
- [ ] Data freshness: writes are based on the latest data, the UI updates immediately after success, a missing record is handled (R1–R3)
- [ ] Destructive actions are confirmed, and the confirmation dialog names the object and the consequence (I2)
- [ ] Feedback and loading indicators are correct, and raw backend errors are not exposed (I3, I4)
- [ ] Color, font size, spacing and radius use only tokens and scales, and fixed sizes are explained (F1–F4, F7)
- [ ] Copy exists in Chinese and English, wording is consistent, and button and title copy follows the rules (C1–C4, C6, C7)
- [ ] Icon buttons are accessible, focus is visible and goes somewhere sensible, and information is not conveyed by color alone (A1–A3, A6)
- [ ] Usable on narrow screens, in the dark theme and with a Chinese input method (A4, F6, A7)
