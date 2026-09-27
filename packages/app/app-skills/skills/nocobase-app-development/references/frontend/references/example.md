# Worked example: the projects feature

The complete source of the example the frontend handbook uses throughout: a projects list with search and a status filter, a create dialog, a detail drawer with an edit dialog stacked on it, a shared form and a delete confirmation, and the other complete components the topic documents describe. Every file compiles against this template and passes its lint rules. Each file of the feature has its own document under `example/`, which opens with the rules it follows, a **Depends on** line naming the documents whose files it imports (and the route it needs), an **Add first** line naming the primitives it imports that the template does not ship, and, for a page, a **Links to** line naming the child routes it opens. The remaining complete components live in the topic documents that explain them.

Start from the document for your task, then copy every document its **Depends on** line names, and theirs in turn; add what **Links to** names or drop those links:

| Task                                                       | Start from                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A list page with a create dialog                           | [list page](example/list-page.md) without its row menu and delete dialog, and [create dialog](example/create-dialog.md)                                                                  |
| A list page with create, detail, edit and delete           | [list page](example/list-page.md), [create dialog](example/create-dialog.md), [detail drawer](example/detail-drawer.md) and [edit dialog](example/edit-dialog.md)                        |
| A list paginated by the server                             | [server table](example/server-table.md), which changes the list page, with the child routes the list page uses                                                                           |
| A form too long for a dialog                               | [create page](example/create-page.md)                                                                                                                                                    |
| A form field that points at another record                 | [customer picker](example/customer-picker.md)                                                                                                                                            |
| A settings page                                            | [settings page](example/settings-page.md); [public switch](example/public-switch.md) for a toggle; [settings form](example/settings-form.md) for every other control                     |
| A component that loads one record, or a single-click write | [project summary](example/project-summary.md) or [complete button](example/complete-button.md)                                                                                           |
| A record detail page with tabs                             | [project summary](example/project-summary.md) for the loader; the page itself is ["A record detail page with tabs" in `child-routes.md`](child-routes.md#a-record-detail-page-with-tabs) |

The template ships neither `client/components/session-expired-alert.tsx` nor `client/hooks/use-url-search.ts`: the first feature that needs one copies it from its document here, and later features import it.

The template ships only twelve shadcn/ui primitives. A document whose file imports another one says so on its **Add first** line; run that command before copying the file, then format the files it creates, as [section 1 of `shadcn.md`](shadcn.md#1-what-the-template-ships-and-how-to-add-the-rest) describes. The whole feature needs:

```bash
yes n | pnpm exec shadcn add alert alert-dialog badge card checkbox combobox empty field input-group radio-group skeleton switch textarea
```
