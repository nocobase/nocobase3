# @nocobase/app-plugin-i18n

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
