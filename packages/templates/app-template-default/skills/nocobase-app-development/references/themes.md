# Create or edit an application theme

Theme presets belong to the App, not a plugin. Read `components-and-styling.md` for semantic tokens and `i18n.md` for localized labels.

## Add a preset

1. Copy `client/theme/themes/default.css` to a stable lowercase ID such as `forest.css`. Keep default first in the registry: it is the fallback.
2. Define every color token in both light and dark rules. Use `:root[data-theme='forest'], .theme-preview[data-theme='forest']` for light; `:root.dark[data-theme='forest'], :root.dark .theme-preview[data-theme='forest']` for dark. Do not retain the default file's bare root selectors.
3. Import the CSS from `client/styles.css`, after default. Add the ID and label key to `client/theme/theme-presets.ts`, then the label to every locale.
4. The Appearance popover discovers registry entries automatically. Preview cards use the same CSS variables, not a second palette in JavaScript. Theme CSS is loaded through `client/styles.css`, imported by the client entry.
5. Check foreground/background, primary/primary-foreground, muted text, borders, focus rings, forms, dialogs and loading states in both modes. Use WCAG AA contrast as the baseline.

## Edit or remove

Edit the existing preset's CSS instead of changing component colors. Keep its ID when changing its look or label. To remove a non-default preset, remove its registry entry, CSS import/file and locale labels together. Unknown saved IDs fall back to default. Do not add development-data migrations.

## Runtime invariants

`next-themes` owns light/dark/system; presets only set `data-theme`. Do not make a preset force a mode. Keep DOM changes centralized in `client/theme/`.

Storage keys come from `resolveAppBase()`, not the current route or the first pathname segment. `/team/crm/` becomes `team%2Fcrm`; the root becomes `%2F`. Keys are `nocobase:<scope>:theme:color-scheme` and `nocobase:<scope>:theme:preset`. This is browser-local, App-scoped preference, not account synchronization.

## Verify

Run the theme preference and client-theme tests, then the App's checks. In a browser, verify saved preferences are restored after client startup, all mode/preset combinations, narrow screens, keyboard selection/Escape/focus return, same-App cross-tab sync and isolation from a second App on the same origin. Test unavailable storage and a removed preset. In the source monorepo, apply template framework changes to Default and Hub together.
