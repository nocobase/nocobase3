# Create or edit an application theme

Theme presets belong to the App, not a plugin. Read [the token reference](theme-tokens.md) for the complete names, meanings, units, defaults, utility classes and limitations; read `i18n.md` for localized labels.

## Add a preset

1. Copy `client/theme/themes/default.css` to a stable lowercase ID such as `forest.css`. Keep default first in the registry: it is the fallback.
2. Define all colors, fonts, sizes with their line heights, spacing, radius and shadows in the base rule. Define every color again in dark; non-color tokens inherit the preset base unless explicitly overridden. Use `:root[data-theme='forest'], .theme-preview[data-theme='forest']` for light; `:root.dark[data-theme='forest'], :root.dark .theme-preview[data-theme='forest']` for dark. Do not retain the default file's bare root selectors.
3. Import the CSS from `client/styles.css`, after default. Add the ID and label key to `client/theme/theme-presets.ts`, then the label to every locale.
4. The Appearance popover discovers registry entries automatically. Preview cards use the same CSS variables, not a second palette in JavaScript. Theme CSS is loaded through `client/styles.css`, imported by the client entry.
5. Add the resources and CJK/system fallbacks for any new font. Check body/headings/code, long text, controls, navigation, charts when present, spacing, corner sizes and shadows in both modes. Verify readable contrast, unclipped text and visible keyboard focus. The preview is a color thumbnail, not a full typography/layout preview.

## Edit or remove

Edit the existing preset's CSS instead of changing component styles or `components.json`. Do not add shared tokens or change component APIs without design approval. Keep its ID when changing its look or label. To remove a non-default preset, remove its registry entry, CSS import/file and locale labels together. Unknown saved IDs fall back to default. Do not add development-data migrations.

## Runtime invariants

`next-themes` owns light/dark/system; presets only set `data-theme`. Do not make a preset force a mode. Keep DOM changes centralized in `client/theme/`.

Storage keys come from `resolveAppBase()`, not the current route or the first pathname segment. `/team/crm/` becomes `team%2Fcrm`; the root becomes `%2F`. Keys are `nocobase:<scope>:theme:color-scheme` and `nocobase:<scope>:theme:preset`. This is browser-local, App-scoped preference, not account synchronization.

## Verify

Run the theme token, preference and client-theme tests when available, then the App's checks. Verify distinctly different font, size, spacing and shadow values in a browser; a compiled CSS check cannot prove layout correctness. In a browser, verify saved preferences are restored after client startup, all mode/preset combinations, narrow screens, keyboard selection/Escape/focus return, same-App cross-tab sync and isolation from a second App on the same origin. Test unavailable storage and a removed preset. In the source monorepo, apply template framework changes to Default and Hub together.
