# @nocobase/app-plugin-file-example

## 0.0.2-beta.2

### Patch Changes

- 5a891d7: Replace the File plugin's legacy backend and client protocol with File Repository services, multipart uploads, and configurable content routes. Preserve its editable Registry components and adapt them to ClientFileRepository and contentUrl. Remove the separate File Repository package, rename its example to app-plugin-file-example, and update application registration and Agent integration guidance.

  This is a breaking replacement of the old File API: access-token routes, inventory settings, FilesClient, and runtime component exports are removed. Applications own file collections and route security; metadata deletion retains storage objects. The example migration remains unchanged.

  Keep the File core in Default and the core plus app-plugin-file-example in Examples. Preserve Hub without a default File registration.

  Require the unified API version for Registry components, preserve PDF previews across cross-origin storage redirects, and normalize database file sizes to safe numeric values without treating custom record or records fields as response envelopes.

- Updated dependencies [e3fa827]
- Updated dependencies [c3e02bf]
- Updated dependencies [0a3fa83]
- Updated dependencies [1d042c0]
- Updated dependencies [5a891d7]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/app-client@1.0.0-beta.12
  - @nocobase/db@1.0.0-beta.4
  - @nocobase/app-plugin-file@0.1.0-beta.9

## 0.0.2-beta.1

### Patch Changes

- 52d1107: Declare each peer dependency once, dropping the devDependency that used to accompany it.

  The pairing was required on the grounds that a peer range is wide enough for development to drift off this repository's copy. It is not: pnpm installs a peer and links it into the plugin's own `node_modules`, resolving `workspace:^` to the same package `workspace:*` would. A plugin with the devDependency removed still links, typechecks, builds, and tests against it — verified against a clean install with every plugin's `node_modules` deleted first.

  What remained was a second declaration that changed nothing and had to be kept in step with the first. `pnpm peers:check` no longer asks for it, and `create-plugin` no longer emits it.

- Updated dependencies [52d1107]
  - @nocobase/app-plugin-file-repository@0.0.2-beta.1

## 0.0.2-beta.0

### Patch Changes

- 5281fd1: Add File Repository Client and Server services, multipart uploads and configurable stream/redirect route helpers. Keep the attachments migration, concrete API configuration and development page in a separate example plugin, and register both plugins in the default application.
- Updated dependencies [d29d1fe]
- Updated dependencies [5281fd1]
  - @nocobase/app-server@1.0.0-beta.8
  - @nocobase/app-plugin-file-repository@0.0.2-beta.0
  - @nocobase/app-client@1.0.0-beta.11
  - @nocobase/db@1.0.0-beta.3
  - @nocobase/i18n@1.0.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.1

## 0.0.1

### Patch Changes

- Demonstrate the File Repository core plugin with an attachments migration, concrete upload/content routes, and a development page.
