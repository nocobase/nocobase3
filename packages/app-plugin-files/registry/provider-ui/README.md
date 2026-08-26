# NocoBase Files Provider UI

Application-owned Files client configuration shared by the Files page and
component Registry items. `useFilesUi` works without a Provider by using the
current App `/api` base. Add `FilesUiProvider` only when a subtree needs a
custom `AppClient` or file URL builder.

After installation, import from
`@/extensions/nocobase-files-provider-ui`. Keep this item focused on the
Provider, Context, hook, and default App client configuration.
