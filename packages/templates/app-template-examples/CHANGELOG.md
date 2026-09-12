# @nocobase/app-template-examples

## 0.1.0-beta.4

### Minor Changes

- a009e2d: Derive the languages an application offers from its own locale files, and configure the default language in one place.

  `i18n.defaultLocale` in `config.yml` now names the language the application starts in, for the browser and the server alike. The `i18n.locales` setting and its `APP_LOCALES` environment variable are removed, along with `client.app.defaultLocale`: an application offers whichever languages its own `client/locales/index.ts` and `server/locales/index.ts` declare loaders for, so adding a language means adding its file rather than editing a second list. A plugin's locale file supplies translations for those languages and no longer adds one, which keeps an installed plugin from putting an unexpected language in the picker.

  The browser resolves its startup language as the visitor's stored choice, then `i18n.defaultLocale`, then `en-US`. `navigator.language` is no longer consulted. Switching language in the interface remains a user-level choice and does not change the configured default.

  An untranslated key now falls back through `i18n.defaultLocale` and then `en-US`, rather than through the default alone. An application that defaults to Chinese and adds Spanish leaves its plugins translated in neither, and English is the language they are most likely to ship; the fallback languages are loaded alongside the one in use so the fallback has resources to read. `pnpm nocobase app i18n:check` reports a language declared in `client/locales/` but not `server/locales/`, or the reverse — the case where the interface offers a language the server then rejects.

  `LocaleResource` and `PartialLocaleResource` now accept an `overrides` block at the top level. The shape is derived from the source locale, which never declares that key, so annotating a locale file with it and adding the block documented for rewording a plugin's copy was a compile error — the documented example did not compile.

  To migrate, replace `i18n.locales` and `client.app.defaultLocale` with `i18n.defaultLocale`, and make sure every language the application offers has a file in its own `client/locales/` and `server/locales/`.

- e9f796d: Run plugin-registered commands during `pnpm build` and `pnpm dev`

  Both scripts now ask the application's CLI which commands its plugins have registered, and run them at the matching stage. The workflow Artifact build was written directly into these scripts and moves to the workflow plugin, which is what installs it; an application without that plugin no longer carries the step, and a plugin that needs one no longer requires an edit here.

  Failing to read the list fails the run: a build that silently skipped a hook would look successful while missing whatever the hook produces. Declaring no hooks is not that case and changes nothing.

### Patch Changes

- b90a65f: Keep the sidebar at viewport height

  On a tall page the desktop sidebar used to stretch along with the document, because it was a stretched flex item of a `min-h-svh` shell. Its navigation therefore never scrolled: the whole page moved instead, and the sidebar's header and footer drifted out of view. The sidebar now sticks to the viewport at a fixed height, and the menu scrolls inside it once its entries overflow. The same fix applies to the settings and dev-tools surface, which shares the layout.

- 426bd48: Remove logical IM `target` recipients and make `send().to` optional so Webhook Providers can be selected directly by Provider name or fan-out strategy.
- 1d59a9c: Add a template upgrade Skill and record the source template in the generated manifest.

  `skills/nocobase-app-upgrade/` describes how to merge a newer template release into an application generated from a template. It compares the two template releases to learn what changed, then decides file by file how each change lands in the application, so a customization is never reverted and a removal that breaks user code outside the changed files is caught before the upgrade is called done.

  `pnpm create @nocobase/app` now writes `nocobase.templatePackage` into the generated manifest, naming the template package the application came from. An upgrade needs it to know which template to diff: `name` becomes the application's own at generation, and `templateKind` does not distinguish the app templates from each other.

- Updated dependencies [adedf9c]
- Updated dependencies [a009e2d]
- Updated dependencies [e9f796d]
- Updated dependencies [e9f796d]
- Updated dependencies [426bd48]
- Updated dependencies [e9f796d]
- Updated dependencies [aa7420a]
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.8
  - @nocobase/app-plugin-i18n@0.1.0-beta.5
  - @nocobase/app-server@1.0.0-beta.10
  - @nocobase/app-plugin-workflow@0.1.0-beta.13
  - @nocobase/app-plugin-cli-example@0.1.0-beta.2
  - @nocobase/app-plugin-notification@0.1.0-beta.7
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.5
  - @nocobase/nb3-cli@1.0.0-beta.6

## 0.1.0-beta.3

### Patch Changes

- f5b066d: Declare `@nocobase/db` and `@nocobase/service-provider` in `dependencies`, so a generated application can build its server

## 0.1.0-beta.2

### Minor Changes

- c3e02bf: Support client.app.defaultLocale, defaultColorScheme, and defaultTheme configuration while preserving saved user preferences and ignoring unsupported defaults.

### Patch Changes

- 1d042c0: Align the Examples template with nested routes and route-owned navigation.
- f79ab75: Remove type declarations, third-party source maps, and third-party documentation from the deployment build, cutting the archive an application deploys from by roughly 30%
- f5b066d: Add `pnpm build --tar`, which packs the deployment build and `config.example.yml` into `storage/dist.tar.gz`
- 1d042c0: Only display navigation icons when explicitly configured.
- 741d0eb: Remove the commercial AI Knowledge Base plugin dependency and default runtime composition from the open-source application templates.
- 1d042c0: Reset page loading and error state when navigating to another route.
- 0a3fa83: Always show the notification test action, use user-facing delivery method labels, and enforce its permission only when a test message is submitted.
- f5b066d: Document `pnpm build --tar` in the template README
- 5a891d7: Replace the File plugin's legacy backend and client protocol with File Repository services, multipart uploads, and configurable content routes. Preserve its editable Registry components and adapt them to ClientFileRepository and contentUrl. Remove the separate File Repository package, rename its example to app-plugin-file-example, and update application registration and Agent integration guidance.

  This is a breaking replacement of the old File API: access-token routes, inventory settings, FilesClient, and runtime component exports are removed. Applications own file collections and route security; metadata deletion retains storage objects. The example migration remains unchanged.

  Keep the File core in Default and the core plus app-plugin-file-example in Examples. Preserve Hub without a default File registration.

  Require the unified API version for Registry components, preserve PDF previews across cross-origin storage redirects, and normalize database file sizes to safe numeric values without treating custom record or records fields as response envelopes.

- Updated dependencies [e3fa827]
- Updated dependencies [0a3fa83]
- Updated dependencies [0a3fa83]
- Updated dependencies [0a3fa83]
- Updated dependencies [1d042c0]
- Updated dependencies [0a3fa83]
- Updated dependencies [eb3bc38]
- Updated dependencies [5a891d7]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/app-plugin-authentication@0.1.0-beta.10
  - @nocobase/app-plugin-authorization@0.2.0-beta.9
  - @nocobase/app-plugin-notification@0.1.0-beta.6
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.7
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.4
  - @nocobase/db@1.0.0-beta.4
  - @nocobase/app-plugin-repository-example@0.1.0-beta.3
  - @nocobase/app-plugin-workflow@0.1.0-beta.12
  - @nocobase/app-plugin-file@0.1.0-beta.9
  - @nocobase/app-plugin-file-example@0.0.2-beta.2

## 0.1.0-beta.1

### Minor Changes

- 52d1107: Keep client packages out of the server deployment, and make every native binary match the platform being deployed to.

  A plugin's `client/` is compiled by the consuming application's Vite build, so the packages it imports have to be published in the plugin's manifest — but a server has no client build and never requires them. Plugins now declare those as peer dependencies, and the generated `dist/pnpm-workspace.yaml` sets `autoInstallPeers: false`, so an application installs one shared copy while a deployment installs none. What reaches a server is decided by declarations rather than by analysis.

  Native binaries are compiled for one platform, architecture, C library, and Node ABI at once, so a build made on a Mac installs binaries a Linux server cannot load. `pnpm build` targets the machine it runs on, keeping `pnpm build && pnpm start` working; `--target linux-x64` (or `linux-arm64`, `linux-x64-musl`, `darwin-arm64`, `win32-x64`) and `--node-version` select another. Each build states the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

  The build then verifies its own result: it fails when a package the application's own server, database, or CLI code imports would not reach a deployment. It reads literal specifiers, so an import whose name is assembled at run time is invisible to it and has to be declared deliberately.

  Add `pnpm server:deps:retarget` and `pnpm server:deps:verify`, which run the two steps on their own.

### Patch Changes

- 52d1107: Declare the packages an application's server, database, and CLI code imports in `dependencies` rather than `devDependencies`, and generate `dist/package.json` from that declaration instead of by scanning the built output.

  The scan existed because the declaration did not: with every package in `devDependencies`, nothing could tell which of them a deployment needed, so the build walked `dist/server` for bare imports and expanded each transitive dependency by hand. With the declaration correct, `pnpm install` applies the same rules — a plugin's `dependencies` come along, its `peerDependencies` are skipped by `autoInstallPeers: false`, and `devDependencies` were never published — and a scan that resolves specifiers is a scan that can miss one.

- 52d1107: Resolve the shared UI packages through the workspace catalog: `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, and `tw-animate-css`.

  Every package already agreed on one version for each of these — the catalog is what keeps them agreeing. A range edited in one manifest and not the others would otherwise put two copies of a UI primitive into an application's bundle, which is the kind of drift nothing reports until a component behaves differently depending on which plugin rendered it.

  Peer dependencies use `catalog:` too. `pnpm pack` resolves it before publishing, so a consumer still reads an ordinary range.

- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
- Updated dependencies [52d1107]
  - @nocobase/app-plugin-ai-employee@0.1.0-beta.5
  - @nocobase/app-plugin-ai-knowledge-base@0.1.0-beta.5
  - @nocobase/app-plugin-authentication@0.1.0-beta.9
  - @nocobase/app-plugin-authorization@0.2.0-beta.8
  - @nocobase/app-plugin-i18n@0.1.0-beta.4
  - @nocobase/app-plugin-install@0.1.0-beta.6
  - @nocobase/app-plugin-notification@0.1.0-beta.5
  - @nocobase/app-plugin-notification-in-app@0.2.0-beta.6
  - @nocobase/app-plugin-workflow@0.1.0-beta.11
  - @nocobase/app-plugin-repository-example@0.1.0-beta.2
  - @nocobase/app-plugin-routes-example@0.1.0-beta.8
  - @nocobase/app-plugin-file-repository@0.0.2-beta.1
  - @nocobase/app-plugin-notification-providers@0.2.0-beta.3
  - @nocobase/app-plugin-cli-example@0.1.0-beta.1
  - @nocobase/app-plugin-database-example@0.1.0-beta.5
  - @nocobase/app-plugin-file-repository-example@0.0.2-beta.1
  - @nocobase/app-plugin-queue-example@0.1.0-beta.5
  - @nocobase/app-plugin-realtime-example@0.1.0-beta.5
  - @nocobase/app-plugin-service-provider-example@0.1.0-beta.3
  - @nocobase/app-plugin-skills-example@0.1.0-beta.2

## 0.0.2-beta.0

### Patch Changes

- d29d1fe: Add an independent Examples application template based on Default, with a localized examples homepage, article management, initial data, and registered capability examples. Add the `examples` template alias to create-app and include the template in release version synchronization.
- d29d1fe: Register Workflow commands in the application CLI and build workflow artifacts through `pnpm nocobase workflow build`.
- f5b066d: Fix development startup by building workflows through the application CLI instead of the removed standalone workflow command.
- d29d1fe: Remove the system information plugin package from the workspace and all application templates. Remove its client page, server API, plugin registrations, dependencies, synchronized Skills and integration test references. Document the source upgrade and use a new plugin name in the scaffolding tutorial.
- d29d1fe: Align plugin discovery, development watches, and deployment packaging with the CLI composition roots and remove duplicate plugin manifest metadata.
- d29d1fe: Remove `@nocobase/app-plugin-file` from all application templates, including client/server registration, direct dependencies, test fixtures and installed-plugin guidance. The plugin's file inventory settings page and API are no longer included by default. Preserve stored files and independently registered file Repository capabilities.

## 0.0.1

### Patch Changes

- Initial Examples application template, based on the Default application with article management and registered capability examples.
