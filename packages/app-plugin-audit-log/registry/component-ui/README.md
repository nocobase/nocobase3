# Audit Log App Plugin Component

This Registry item is an editable component recipe for consuming applications.
It has no route or `extension.ts`, so installing it does not change application
behavior until the application imports and renders `PluginFeatureCard`.

After installation, import the component through this item's `index.ts`. Pass
application data and callbacks through props rather than importing plugin
internals. The `Button` import resolves to the consuming application's shadcn
component and is declared by `registryDependencies` in `registry.config.json`.

The installed copy belongs to the consuming application. When a newer plugin
version updates this canonical source, review the upstream diff and merge it
with application changes instead of overwriting the installed copy.
