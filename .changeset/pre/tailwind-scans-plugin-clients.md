---
'@nocobase/app-template-default': patch
---

Fix plugin utility classes missing from the stylesheet, which left plugin pages unstyled in a generated application: spacing collapsed, buttons stretched full width, and badge colours disappeared.

The `@source "../node_modules/@nocobase/app-plugin-*/client"` globs never matched anything. pnpm links every dependency as a symlink into its store, and Tailwind's scanner does not expand a wildcard through one, so no plugin file was ever scanned — in this repository or in a generated application. It only looked correct here because workspace plugins resolve to TypeScript sources that Vite compiles, and the Tailwind Vite plugin scans what Vite transforms. An installed plugin resolves to prebuilt `dist/client` output, which Vite does not transform, so neither mechanism saw it.

A `tailwind.config.mjs` now resolves each plugin's client directory to its real path before scanning, which gets past the symlink, and covers both `client` and `dist/client` so a workspace plugin and an installed one are scanned the same way. `@nocobase/app-client` is scanned through the same mechanism, replacing a `@source` that pointed outside a generated application's directory and resolved to nothing there.
