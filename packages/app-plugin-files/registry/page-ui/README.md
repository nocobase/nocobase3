# Files Page UI

This Registry item is an application-owned replacement for the plugin's
`/files-demo` component. The required `@nocobase/app-plugin-files` plugin must
be enabled; the plugin continues to provide the route and backend contract.
The default installation target is
`client/extensions/nocobase-files-page-ui`.

The page requests `GET /api/attachments/examples`, creates a client for each
endpoint returned by that response, and demonstrates the real Profile Avatar
and Order Attachments flows. It composes the `component-ui` Registry item and
uses the stable `FILES_ROUTE_IDS.demo` route override contract.

Installing this item does not declare a second route. Plugin upgrades do not
overwrite this source. Review future changes with a three-way merge and keep
application-specific copy, labels, and layout changes.
