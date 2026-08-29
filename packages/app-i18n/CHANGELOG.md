# @nocobase/app-i18n

## 0.0.1

### Patch Changes

- Add the internationalization runtime shared by applications and plugins. Namespaces are package names, a namespace falls back to the application's translations and then to the base package's, and resources load one locale at a time so only the language in use is fetched.
