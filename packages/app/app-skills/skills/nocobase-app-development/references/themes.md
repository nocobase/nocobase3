# Create or edit an application theme

Theme presets belong to the App, not a plugin. Read [the token reference](theme-tokens.md) for the complete names, meanings, units, defaults, utility classes and limitations; read `i18n.md` for localized labels.

## Add a preset

1. Copy `client/theme/themes/default.css` to a stable lowercase ID such as `forest.css`. Keep default first in the registry: it is the fallback.
2. Define all colors, fonts, sizes with their line heights, spacing, radius and shadows in the base rule. Define every color again in dark; non-color tokens inherit the preset base unless explicitly overridden. Use `:root[data-theme='forest'], .theme-preview[data-theme='forest']` for light; `:root.dark[data-theme='forest'], :root.dark .theme-preview[data-theme='forest']` for dark. Do not retain the default file's bare root selectors.
3. Import the CSS from `client/styles.css`, after default. Add the ID and label key to `client/theme/theme-presets.ts`, then the label to every locale.
4. The Settings theme page discovers registry entries automatically: each entry becomes one card in `client/pages/settings/theme/`, in registry order and labelled from its locale. The page filters the cards by localized name or ID through a search field that is always present, so adding dozens of presets needs no change to the page. Preview cards use the same CSS variables, not a second palette in JavaScript. Theme CSS is loaded through `client/styles.css`, imported by the client entry.
5. Add the resources and CJK/system fallbacks for any new font. Check body/headings/code, long text, controls, navigation, charts when present, spacing, corner sizes and shadows in both modes. Verify readable contrast, unclipped text and visible keyboard focus. The preview is a color thumbnail, not a full typography/layout preview.

## Convert a preset from another project

A published preset collection is a source of palettes, not of finished themes: its fonts, spacing, shadow parts and letter spacing were chosen for the project that published it. Converting one keeps the two things the palette owns.

1. State the tokens the preset does not intend to change by copying them from `client/theme/themes/default.css` verbatim — fonts, text sizes with their line heights, spacing and shadows — then set the upstream radius and all 31 colours in both modes. A converted file then differs from Default in exactly the palette and the corners, it stands alone when someone reads it, and the token test can hold it to that.
2. Check the source licence before shipping the file, and record where it came from in `client/theme/themes/THIRD-PARTY-NOTICES.md`: the repository, the file, the revision, the licence, and what was dropped in the conversion.
3. Do not carry a third-party font stack over by default. It usually lacks a CJK fallback, and adopting one means a font resource, a licence check and a loading cost; the application's own stack is the answer unless the fonts are the point of the theme.
4. An upstream palette has not been contrast-audited against this application's components. Measure each surface/foreground pair in both modes before shipping, and decide deliberately about a pair below 4.5:1 — adjust the value, drop the preset, or state the measurement in the pull request so the trade-off is visible.
5. An upstream preset may spend the generic surface and outline roles on decoration, which this contract reserves for structure. Check three things against the presets already here before shipping one: `--card` sits in `--background`'s hue family rather than a different one, `--border` is a low-chroma hairline rather than a restatement of `--primary`, and `--muted` is a near-background tint rather than a colour in its own right. An upstream demonstration page with one card and a few dividers hides the difference; a settings page stacking several panels over dozens of hairlines turns the same values into competing hues. Retune the ones that fail, and record what changed and why in both the preset's header comment and `THIRD-PARTY-NOTICES.md`. `bubblegum` is the worked example: its `--card` was 101 degrees of hue from its `--background`, its `--border` was `--primary` itself, and its `--muted` was a cyan.
6. Register the preset and its label, and verify it in a browser, like any other theme.

## Edit or remove

Edit the existing preset's CSS instead of changing component styles or `components.json`. Do not add shared tokens or change component APIs without design approval. Keep its ID when changing its look or label. To remove a non-default preset, remove its registry entry, CSS import/file and locale labels together. Unknown saved IDs fall back to the configured default, or the first registered preset (`default`). Do not add development-data migrations.

## Runtime invariants

`next-themes` owns light/dark/system; presets only set `data-theme`. Do not make a preset force a mode. Keep DOM changes centralized in `client/theme/`.

Two controls read the provider and keep no copy of the preference themselves: the header button (`client/theme/theme-mode-toggle.tsx`) switches the resolved mode in place, and the theme page calls `useThemePreset()` to store a preset. The button offers no "follow system" option, so a browser on `system` moves to the opposite explicit mode on the first click; theme names come from the locale, and the button from `appearance.toggle`.

Storage keys come from `resolveAppBase()`, not the current route or the first pathname segment. `/team/crm/` becomes `team%2Fcrm`; the root becomes `%2F`. Keys are `nocobase:<scope>:theme:color-scheme` and `nocobase:<scope>:theme:preset`. This is browser-local, App-scoped preference, not account synchronization.

## Verify

Run the theme token, preference, client-theme and theme-page tests when available, then the App's checks. Verify distinctly different font, size, spacing and shadow values in a browser; a compiled CSS check cannot prove layout correctness. In a browser, verify saved preferences are restored after client startup, that the header button switches light and dark and keeps the change across a reload, that the card grid wraps on a narrow window and on a wide one, that search filters the grid by name and by ID and reports an empty result, and that keyboard selection, same-App cross-tab sync and isolation from a second App on the same origin still hold. Test unavailable storage and a removed preset. In the source monorepo, apply shared template framework changes to every applicable application template and update this package when the shared guidance changes.

## Application defaults

Set optional `client.app.defaultColorScheme` (`light`, `dark`, or `system`) and `client.app.defaultTheme` (an ID in `client/theme/theme-presets.ts`) in `config.yml`. Startup and the theme provider read the same injected configuration. Each valid saved browser preference overrides its configured default independently; missing or invalid configuration falls back to `system` and the first registered preset (`default`). Clearing preferences, including in another tab, restores the configured defaults. Defaults are not saved as user choices. Refresh after changing configuration.

`system` stays valid as a configured default even though no control selects it: an application starts by following the system and stops only when someone uses the header button.
