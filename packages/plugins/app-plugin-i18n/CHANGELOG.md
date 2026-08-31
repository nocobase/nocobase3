# @nocobase/app-plugin-i18n

## 0.1.0-beta.1

### Minor Changes

- ac3f033: Export every server plugin from its package's `./server` entry point, and update application composition, plugin discovery, and generated plugins to use the unified entry point.

### Patch Changes

- fb1a752: Unify Client and Server application composition around the explicit `serviceProviders` contribution and rename Client React tree contributions to `reactProviders`.

  Replace Client bootstrap modules with application-owned ServiceProvider lifecycle hooks, make the default Client start through `ClientApplication` and render through the Browser host, and update built-in plugins and runtime inspection to the new static contribution protocol.

- Updated dependencies [fb1a752]
- Updated dependencies [948304d]
- Updated dependencies [ac3f033]
- Updated dependencies [fb1a752]
- Updated dependencies [78cf0a2]
- Updated dependencies [fb1a752]
  - @nocobase/app-client@1.0.0-beta.5
  - @nocobase/app-server-kit@0.1.0-beta.3
  - @nocobase/app-sdk@0.0.1-beta.0

## 0.0.2-beta.0

### Patch Changes

- b049266: Add language switching on top of `@nocobase/app-i18n`. Applications and plugins declare their locales the same way on both sides, the browser loads only the language it is showing, and the chosen one is kept in storage and mirrored to the server session.
- b049266: Request the locale endpoint under the application's base path. It was hard-coded to the origin root, so switching language on an app served from a base path posted to a URL that did not exist.
- Updated dependencies [b049266]
- Updated dependencies [b049266]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [ce4eab8]
- Updated dependencies [7cdffbd]
- Updated dependencies [b049266]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
  - @nocobase/app-i18n@0.0.2-beta.0
  - @nocobase/app-client@1.0.0-beta.4
  - @nocobase/app-server-kit@0.1.0-beta.2
  - @nocobase/app-sdk@0.0.1-beta.0

## 0.0.1

### Patch Changes

- Add language switching on top of `@nocobase/app-i18n`. Applications and plugins declare their locales the same way on both sides, the browser loads only the language it is showing, and the chosen one is kept in storage and mirrored to the server session.
