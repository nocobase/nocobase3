# File Page UI

This Registry item is an application-owned replacement for the plugin's
`/file-demo` component. The required `@nocobase/app-plugin-file` plugin must
be enabled; the plugin continues to provide the route and backend contract.
The default installation target is
`client/extensions/nocobase-file-page-ui`.

The page requests `GET /api/attachments/examples`, creates a client for each
endpoint returned by that response, and demonstrates the real Profile Avatar
and Order Attachments flows. It composes the plugin's stable public client API
and components, so it can be installed independently from the `component-ui`
Registry item. It uses the stable `FILE_ROUTE_IDS.demo` route override
contract.

The backend permits this page only for system administrators. Applications may
render their normal permission error state for authenticated users without the
required Permission Set; no storage configuration is exposed to the page.

Installing this item does not declare a second route. Plugin upgrades do not
overwrite this source. Review future changes with a three-way merge and keep
application-specific copy, labels, and layout changes.
