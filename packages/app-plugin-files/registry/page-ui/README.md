# NocoBase Files Page UI

Complete application-owned Files page for the route declared by the Files App
Plugin. The installed `extension.ts` overrides only the component loader for
`FILES_ROUTE_IDS.index`; it does not redeclare `/files`, route authentication,
or the route name.

The page uses the consuming application's `@/components/ui/button` and the
installed Files Provider item. It never imports the plugin's default page or
plugin-owned UI primitives. Review upgrades with a three-way merge instead of
overwriting application changes.
