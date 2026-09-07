# Quick start for an application

Start with the three executable source files below, not a new business plugin.
They implement a saved order's private PDF attachments using the application's
existing Database, Drive, Session, authentication, authorization, and API Client.
The package's tests import these same files and typecheck them; there is no
separate, simplified implementation maintained only for the tests.

## 1. Check the App and copy the example

Read the target App's `AGENTS.md` and Client/Server instructions. Confirm that
`@nocobase/app-plugin-file`, Authentication, and Authorization are installed and
registered, and that their migrations have run. Configure the App's existing
Drive disk; S3 configuration belongs there, not in the file route or browser.

Copy the following files into the owning application, adapting business names:

| Executable source                                                         | App destination                           |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| [Migration](example/database/migrations/202609070001_order_attachments.ts)   | `database/migrations/`                     |
| [Server route and authorization](example/server/routes/order-attachments.ts) | `server/routes/order-attachments.ts`       |
| [Complete attachment form](example/client/order-attachments.tsx)            | `client/components/order-attachments.tsx`  |

The example's `tsconfig.json` is only for checking the bundled example. Do not
copy it into the App. Do not edit the File plugin or synchronized
`.agents/skills/` files, run `plugin:create`, or create a `defineServerPlugin()`
for this application-specific feature.

The example creates a new `purchaseOrders` parent with string IDs. For an
existing parent, create only the file table and add its inverse relation through
a new migration. Match `orderId` and its validation to the parent's actual ID
type; do not copy the example's string validation into a numeric-ID schema.
Keep the standard file columns, owner index, and `UNIQUE (disk, key)`.
See [data model](data-model.md) for other relations.

## 2. Register the Server route and grant business access

Import `orderAttachmentRoutes` from the copied module and append it to the
existing array in `server/routes/index.ts`, already consumed by
`server/runtime.ts`. Do not replace the other routes or add `/api` to its child
path: `defineApiRoutes()` supplies that prefix.

The Server example includes real authorization, not an undefined
`authorizePurchaseOrder()` placeholder. It registers the parent resource and
maps every `FileRouteAction` as follows:

| File action                  | Required parent permission                          |
| ---------------------------- | --------------------------------------------------- |
| `list`, `read`, `issue-token`  | `purchaseOrders.read`, output field `attachments`     |
| `upload`, `delete`            | `purchaseOrders.update`, input field `attachments`    |

Grant these actions and the required record range through the App's existing
Permission Sets configuration. For example, `recordsIOwn` uses the registered
`ownerId` attribute; `allRecords` requires an explicit business decision.
Registration alone grants nothing. A user who can read only `number` cannot
read attachments, and an attachment reader cannot upload or delete.

The returned record filter is combined with the parent ID in one existence
query before any management operation. Do not use `can()` for this conditional
database decision, replace it with `return true`, or treat file `scope` as ACL.
The local `compileFilter` translates the Authorization Filter AST; reuse the
App's existing adapter when available. It is not a new File plugin API.
For a previously registered parent, extend its existing registration instead
of registering a second copy. Adapt the action mapping for more specific
business grants when necessary.

Pass authentication through the factory's `auth` option. Do not wrap the whole
router in a login middleware: private content uses a short-lived capability
URL, while public content does not require login. Private `contentUrl` is
unsigned and is not usable by itself, even with a valid session. The supplied
preview components obtain access URLs through the Client.

## 3. Mount the complete form

Render the copied `OrderAttachments` component with the saved `orderId` and an
`onDone` callback that closes the attachment editor or returns to the order.
An absent ID shows a save-first message without constructing an endpoint.
This component already renders a form; do not nest it inside another form.
For an existing order form, move its loading/state logic into that form and
combine its `ready` condition with the existing submit guard.

The component memoizes the Client, loads `client.list()`, blocks editing and
Done until loading succeeds, exposes a retry on load failure, and blocks Done
during uploads or upload errors. The owner key is on the component that owns
all attachment state. Changing orders resets that state and ignores late list
responses, not just pending uploads. Keep these behaviors when adapting it.

Use public components by default; install Registry `component-ui` only when
editable UI source is needed. Do not maintain both implementations for the
same field. The Client endpoint is relative to the App's API root: no `/api`,
origin, public base path, query, or fragment. Put application copy in
`client/locales/`; the example uses English labels to keep its behavior visible.
Only add a lazy page in `client/pages/` and `client/routes.ts` if a new page is
actually needed.

## 4. Preserve lifecycle semantics

Uploads persist immediately. `onDone` does not perform another file save, and
closing or cancelling the form does not roll back completed server writes.
`removeOnDelete` immediately deletes the record and attempts object cleanup;
without it, removal changes only local state. Reconcile with `client.list()`
after an interrupted request. Single-file mode requires explicit removal
before another upload; it is not atomic replacement.

The example uses a restrictive parent foreign key to avoid losing cleanup
metadata through a cascade. Delete attachments deliberately before deleting
an order, with an application policy for failed cleanup. This is not a cleanup
queue or a transaction spanning the database and Drive. A different migration
using SQL cascade still deletes rows only, not storage objects.

Client `accept` supports patterns such as `image/*`; Server `mimeTypes` needs
exact values such as `['image/png', 'image/jpeg']`. The check validates declared
MIME, not file contents. Never store final URLs or tokens or accept disk, key,
table, scope field names, or signing configuration from the browser.

## 5. Verify in the target App

Run the migration, lint, typecheck, focused tests, and build. Verify permitted,
anonymous, and denied requests; parent and attachment-field permissions;
private token access; owner switching; initial load failure/retry; upload
errors; reload; deletion and object cleanup; and the real page-to-API path under
the configured public base path. See [Route API](route-api.md) for the HTTP
contract and token/limit behavior. Passing the plugin tests does not replace
verification of the App's own composition and business grants.
