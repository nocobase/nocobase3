---
name: nocobase-app-plugin-i18n
description: 'Use when adding or changing user-facing text in a NocoBase application or plugin: writing locale files, translating a component, naming a namespace, or translating a label registered before a language is known.'
argument-hint: '[action: add-text|add-locale|translate-component|override-plugin-text] [target-file-or-package]'
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
owner: i18n
version: 1.0.0
last-reviewed: 2026-08-30
risk-level: low
metadata:
  domain-owner: '@nocobase/app-plugin-i18n'
  current-scope: 'applications generated from app-template-default, and the plugins they install'
---

# Goal

Put user-facing text behind a translation key correctly the first time: in the right file, under the right namespace, and in a way that survives a language switch.

# Scope

- Add a string to an application or a plugin and render it translated.
- Add a language to a package that already has locale files.
- Reword a plugin's copy from the application, without editing the plugin.
- Translate a label that is registered before any language is known, such as a menu entry.

# Non-Goals

- Do not build a language picker. `useAppLocale()` exists; `app-template-default` already renders one in `client/shell/language-switcher.tsx`.
- Do not add i18n machinery to an application. The plugin is registered by default and the runtime is wired in `createAppRuntime`.
- Do not use `@nocobase/app-portal-sdk/i18n`. It is the retired Portal runtime with its own i18next instance; mixing the two leaves each holding half the resources.

# The one rule that decides everything

**A namespace is a package name, and the namespace in scope follows the render tree.**

An application's pages get the application's namespace; a plugin's pages get that plugin's, because the host wraps each contribution using the `packageName` it already records. So a component in its own package's routes translates with no namespace at all.

The exception is what most mistakes come from: a component a plugin exports for the application to render is in the _application's_ scope, not its own. It has to name its namespace.

# Procedure

## Adding a string

1. Find the package that owns the text. Application text goes in `client/locales/`; a plugin's text goes in that plugin's `client/locales/`.
2. Add the key to `en-US.ts`. The structure is written once: the type is derived from the value with `LocaleResource<typeof enUS>`, and other locales are annotated with it, which is what makes a typo a compile error.
3. Add the translation to every other locale file. A missing key falls back rather than breaking, so this can lag, but `pnpm i18n:check` will report it.
4. Render it with `useTranslation` from `@nocobase/i18n/client`.

```tsx
import { useTranslation } from '@nocobase/i18n/client';

const { t } = useTranslation();
t('actions.save');
```

Keys nest and are addressed with dots: `t('trigger.types.schedule')`.

## Naming a namespace

Only in these two cases:

**A component rendered outside its own package's routes.** Ask: will this render anywhere other than this plugin's own pages? If yes:

```tsx
const { t } = useTranslation('@nocobase/app-plugin-workflow');
```

Keep the namespace in one constant per package rather than repeating the literal.

**Reaching for the application's wording deliberately.** A plugin cannot write the application's package name — the user chose it — so use the sentinel:

```tsx
import { APP_NS } from '@nocobase/i18n';

t('save', { ns: APP_NS });
```

This is rarely needed. `t('save')` already falls back to the application and then to the base package's common terms.

## Text registered before a language is known

Refine resources register at bootstrap, long before a locale is resolved, so a label cannot be translated there. Pass the key and the namespace instead, and let the navigation translate as it renders:

```ts
refine.addResources([
  {
    name: 'workflow.workflows',
    list: '/workflow/workflows',
    meta: {
      label: 'nav.workflows',
      i18nNs: '@nocobase/app-plugin-workflow',
      parent: 'workflow',
    },
  },
]);
```

Without `i18nNs`, the label is treated as literal text and rendered as-is.

## Adding a language

1. Copy `en-US.ts` to the new locale, annotate it with the type `en-US.ts` exports, and translate the values. Use `PartialLocaleResource<typeof enUS>` while a translation is deliberately incomplete.
2. Add the loader to `locales/index.ts`:

   ```ts
   const locales: LocaleLoaders = {
     'en-US': () => import('./en-US.js'),
     'zh-CN': () => import('./zh-CN.js'),
     'ja-JP': () => import('./ja-JP.js'),
   };
   ```

3. Add the locale to the application's `server/config/i18n.ts`, or to `APP_LOCALES`. A language present in the files but absent from that list is unreachable.

Do this in every package that ships locales, or the new language shows a mix: packages that have it translated, and packages falling back to English.

## Rewording a plugin's text

From the application's locale file, keyed by the plugin's package name:

```ts
const zhCN: AppResource = {
  actions: { save: '保存' },
  overrides: {
    '@nocobase/app-plugin-workflow': {
      trigger: { title: '触发条件' },
    },
  },
};
```

Overrides apply after every namespace has registered, so the application always wins. Do not edit the plugin's own locale file for this — an upgrade would overwrite it.

# Rules

- **Never concatenate translated fragments.** Word order differs by language. Use interpolation: `t('greeting', { name })` against `'Hello {{name}}'`.
- **Pass `defaultValue` where i18n may not be mounted.** A component a focused test renders on its own has no runtime, and `t('a.b')` renders as its key. `t('a.b', { defaultValue: 'Save' })` stays readable.
- **The loader key must be a runtime value.** `locales['en-US']()` written as a literal lets a bundler drop every other language from the build.
- **Outside a request, load the locale first.** In a queue job or cron, `await i18n.ensureLocaleLoaded(locale)` before translating. Skipping it does not throw; translations quietly fall back.
- **Outbound content follows its recipient.** Mail and notifications take an explicit locale — the recipient's, not the locale of whoever triggered the work.

# Verification

```bash
pnpm i18n:check                                    # keys a locale is missing
pnpm --filter <package> typecheck                  # a key absent from the interface
pnpm --filter @nocobase/app-template-default test  # if application text changed
```

Then switch language in the running application and confirm the new text follows. A string that does not change is still a literal somewhere.

# References

This Skill is copied into each application that installs the plugin, so the
packages are named rather than linked by path — where they resolve to depends
on whether you are in this repository or in a generated application.

- `@nocobase/i18n` README — namespaces, the fallback chain, server-side translation, error payloads
- `@nocobase/app-plugin-i18n` README — the switch itself, endpoints, `useAppLocale`
