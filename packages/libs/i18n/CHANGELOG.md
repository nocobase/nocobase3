# @nocobase/i18n

## 1.0.0-beta.2

### Patch Changes

- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.

## 1.0.0-beta.1

### Major Changes

- 174eab5: Rename four packages, dropping the qualifiers they only carried to avoid names the v2 line had taken.

  | Before                     | After                  |
  | -------------------------- | ---------------------- |
  | `@nocobase/app-database`   | `@nocobase/db`         |
  | `@nocobase/app-i18n`       | `@nocobase/i18n`       |
  | `@nocobase/app-server-kit` | `@nocobase/app-server` |
  | `@nocobase/id-generator`   | `@nocobase/snowflake`  |

  There is no compatibility shim: the old names receive no further releases, and a dependency on one has to be repointed by hand. Each package keeps its version history, which is why the changelogs say which name the earlier releases went out under.

  `@nocobase/app-server` reclaims a name the v2 line abandoned at `0.11.1-alpha.5`, so it starts at `1.0.0-beta.0` rather than continuing its own `0.1.0-beta` line — `0.1.0` sorts below `0.11.1`, and npm would have rejected the publish. The other three take names that were never published.

  `@nocobase/snowflake` also now matches what it implements; its only source file was already called `snowflake.ts`.

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
