---
"@nocobase/app-client": minor
"@nocobase/app-plugin-authentication": patch
"@nocobase/app-skills": patch
---

Type-check the paths read through `config.public`. `config.public.get` and `has` now accept only paths declared in the new `PublicAppConfig` interface, and `get` returns that field's type, so a mistyped path or a wrong value type fails `typecheck` instead of reading `undefined` at runtime. A section's owner declares its public fields by augmenting the interface from `@nocobase/app-client`; `i18n.defaultLocale` is declared by the client itself, and `@nocobase/app-plugin-authentication` declares `auth.emailAndPassword.enabled` and `auth.emailAndPassword.disableSignUp`. `PublicConfigPath` and `PublicConfigValue` are exported for code that forwards such a path.
