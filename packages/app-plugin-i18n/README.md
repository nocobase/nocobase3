# @nocobase/app-plugin-i18n

Language switching for a NocoBase application.

The mechanism — namespaces, resource loading, translation — lives in [`@nocobase/app-i18n`](../app-i18n/README.md) and works whether or not this plugin is installed. What this adds is the part a user operates: the endpoints that record which language to answer in, and the hook a picker is built on. An application without it still translates; it simply cannot change language at runtime.

## Registration

`pnpm plugin:register i18n` writes both entries. They amount to:

```ts
// client/plugins.ts
import i18n from '@nocobase/app-plugin-i18n/client';

defineClientPlugins([i18n()]);
```

```ts
// server/plugins.ts
import i18n from '@nocobase/app-plugin-i18n/server';

defineServerPlugins([i18n]);
```

The available languages come from the application's own configuration rather than from the plugin:

```ts
// server/config/i18n.ts
export default defineConfig(({ env }) => ({
  defaultLocale: env.string('APP_DEFAULT_LOCALE', 'en-US'),
  locales: env.string('APP_LOCALES', 'en-US,zh-CN').split(','),
}));
```

## Building a picker

The plugin exports the behaviour, not the control. How a picker looks belongs to the application, which owns its component library and its design:

```tsx
import { useAppLocale } from '@nocobase/app-plugin-i18n/client';

const { locale, locales, setLocale, switching } = useAppLocale();
```

| Field       | Meaning                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `locale`    | The language currently in use                                                       |
| `locales`   | Every available language, each with a `label` in its own language and a `direction` |
| `setLocale` | Switches language; resolves once every namespace has loaded                         |
| `switching` | True while resources are loading, for disabling the control                         |

A label reads as short as stays unambiguous — "中文" rather than "中文（中国）" — and keeps the region only when two enabled languages share a language and the region is what tells them apart.

`app-template-default` builds its picker in `client/shell/language-switcher.tsx`; copy it as a starting point.

## What a switch does

`setLocale(next)` runs the whole chain:

1. Writes `localStorage`, so a refresh cannot lose the choice
2. Loads every registered namespace's resources for the new language, in parallel
3. Tells the server, so it answers in the same language
4. Changes the language, which i18next broadcasts
5. Updates `<html lang>` and `<html dir>`

Step 2 waits for every namespace together, so the switch is atomic: no frame renders half-translated. **Plugins need no code to follow a switch** — one i18next instance serves every namespace, and `useTranslation` subscribes to it.

Step 3 does not block the interface. If it fails the interface has already switched while the server has not, which shows up as a server-produced string arriving in the previous language; the next startup reconciles it.

## Keeping the server in step

The browser is the source of truth for what it renders; the server keeps its own copy so it can answer in the right language. They drift apart routinely — a different browser, an expired session, a switch made in another tab.

`useSyncServerLocale()` sends the browser's language once at startup to reconcile them. It does not block rendering.

## Endpoints

```
GET  /api/i18n/locales   → { defaultLocale, locales: [{ locale, label, direction }] }
POST /api/i18n/locale    { locale } → stores it on the session
```

Both sit under the application's base path, so an application served from `/main` answers at `/main/api/i18n/locale`. `POST` rejects a language the application does not offer, since the value arrives from the browser.

**A known limit:** the language is stored on the session, so tabs sharing an account overwrite each other. Tab A switching to Chinese means tab B's requests also come back in Chinese while its interface is still English. Error payloads carry `ns`, `key`, and `params` alongside the translated `message`, so a frontend can render errors in its own interface language regardless of what the session says.
