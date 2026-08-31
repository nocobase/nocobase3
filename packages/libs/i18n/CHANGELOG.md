# @nocobase/i18n

The versions below were published as `@nocobase/app-i18n`, the name this package carried until it was renamed to
`@nocobase/i18n`. They are kept because they describe this same codebase; the `@nocobase/app-i18n` releases they
name are not, and never will be, versions of `@nocobase/i18n`.

## 0.0.2-beta.0

### Patch Changes

- b049266: Add the internationalization runtime shared by applications and plugins. Namespaces are package names, a namespace falls back to the application's translations and then to the base package's, and resources load one locale at a time so only the language in use is fetched.
- b049266: Derive a locale's type from the source locale with `LocaleResource`, so a package states its structure once instead of maintaining an interface alongside the wording it describes.
- Add `getRequestTranslator(context, namespace?)` for safely reading and optionally namespace-binding the translator installed by the request i18n middleware.

## 0.0.1

### Patch Changes

- Add the internationalization runtime shared by applications and plugins. Namespaces are package names, a namespace falls back to the application's translations and then to the base package's, and resources load one locale at a time so only the language in use is fetched.
