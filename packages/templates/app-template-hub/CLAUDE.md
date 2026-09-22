@AGENTS.md

For creating or editing theme presets, read `.agents/skills/nocobase-app-development/references/themes.md` (from the application root).

For UI styling, use the shared color, font, size, spacing, radius and shadow contract in `.agents/skills/nocobase-app-development/references/theme-tokens.md` (from the application root). Prefer its Tailwind utilities so components respond to theme changes; keep deliberate fixed-size exceptions explicit.

## Compiled migration and seed manifests

The application build generates `.manifest.json` in each compiled migrations and seeds directory after server compilation, path rewriting, and `afterServerBuild` hooks. Keep the manifest generator in the build when customizing it. Plugins generate their own manifests when built; an application must not regenerate manifests for installed dependencies.

TypeScript and compiled JavaScript use the same source checksum for migration history, while the loader separately verifies emitted JavaScript. Marked JavaScript requires its manifest. For a database with old raw JavaScript checksums, first run the compiled representation with matching original output; verified legacy hashes are converted under the task lock. Unreproducible old output remains an error. Never edit historical migrations, and never edit the history table by hand, to resolve an upgrade failure; `pnpm db:repair` is the supported way to realign a checksum you can account for, and `pnpm db:redo` the way to re-run a migration whose branch is still unmerged.
