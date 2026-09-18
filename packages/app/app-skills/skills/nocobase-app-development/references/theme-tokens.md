# Theme token reference

Read this when authoring a theme or styling a component. The App owns these CSS variables in `client/theme/themes/*.css`; `client/styles.css` connects them to Tailwind. Copy current default values from `default.css`, not from an unrelated shadcn preset.

## Colors

Values are complete CSS colors (normally OKLCH), not HSL channels. Define all 31 in both light and dark rules. The surface/foreground pairs control backgrounds and their text or icons; check contrast rather than assuming the pair is accessible.

| Tokens                                              | Meaning / consumers                                       |
| --------------------------------------------------- | --------------------------------------------------------- |
| `--background`, `--foreground`                      | Page surface and default text                             |
| `--card`, `--card-foreground`                       | Cards and panels                                          |
| `--popover`, `--popover-foreground`                 | Floating menus and popovers                               |
| `--primary`, `--primary-foreground`                 | Primary actions                                           |
| `--secondary`, `--secondary-foreground`             | Secondary actions                                         |
| `--muted`, `--muted-foreground`                     | Subtle surfaces and supporting text                       |
| `--accent`, `--accent-foreground`                   | Interactive highlighted surfaces                          |
| `--destructive`                                     | Destructive actions and errors                            |
| `--border`, `--input`, `--ring`                     | General borders, input borders/surfaces, focus indicators |
| `--chart-1` through `--chart-5`                     | Five chart series colors                                  |
| `--sidebar`, `--sidebar-foreground`                 | Navigation surface and text                               |
| `--sidebar-primary`, `--sidebar-primary-foreground` | Selected navigation surface and text                      |
| `--sidebar-accent`, `--sidebar-accent-foreground`   | Navigation hover surfaces and text                        |
| `--sidebar-border`, `--sidebar-ring`                | Navigation dividers and focus indicators                  |

Use semantic classes such as `bg-card text-card-foreground`, `border-input`, `ring-ring`, and `bg-sidebar text-sidebar-foreground`. Charts must explicitly reference `fill-chart-1`, `stroke-chart-2`, or `var(--chart-1)`; a chart library does not choose these variables automatically. Do not wrap a complete color in `hsl()`.

Sidebar values may reference general colors within the same preset, but remain independently configurable. Do not redefine the general palette inside a sidebar to change its appearance.

## Fonts

| Token            | Default / meaning                                     | Consumer                               |
| ---------------- | ----------------------------------------------------- | -------------------------------------- |
| `--font-sans`    | System sans-serif stack with CJK fallbacks; body font | `font-sans`, body                      |
| `--font-serif`   | System serif stack with CJK fallbacks                 | `font-serif`                           |
| `--font-mono`    | System monospace stack                                | `font-mono`, code/pre/kbd/samp         |
| `--font-heading` | `var(--font-sans)`; may be a separate font stack      | `font-heading`, h1–h6 and PopoverTitle |

Values are valid CSS font-family lists, not font sizes or font URLs. Theme selectors must define the heading alias locally, including previews, so it resolves against that preset's body font.

Fonts need resources as well as variables. To use an external typeface, add an appropriate client font dependency/import or a local `@font-face`, then reference its actual family name. Check licensing, supported weights, CJK coverage, loading cost, and fallback rendering. Use `font-display: swap` for local faces when appropriate. Do not preload a whole font catalog or install dependencies at theme-switch time.

A new title component should use a semantic heading or `font-heading`. Ordinary bold text and button labels remain body text; code remains monospace. An explicit font class overrides the semantic element's base font intentionally.

## Font sizes and line heights

Each size has two variables: `--text-<size>` and `--text-<size>--line-height`. Size values use rem; line-height values use unitless ratios.

| Size | Default rem | Default line height |
| ---- | ----------- | ------------------- |
| xs   | 0.75        | 1 / 0.75            |
| sm   | 0.875       | 1.25 / 0.875        |
| base | 1           | 1.5                 |
| lg   | 1.125       | 1.75 / 1.125        |
| xl   | 1.25        | 1.75 / 1.25         |
| 2xl  | 1.5         | 2 / 1.5             |
| 3xl  | 1.875       | 2.25 / 1.875        |
| 4xl  | 2.25        | 2.5 / 2.25          |
| 5xl  | 3           | 1                   |
| 6xl  | 3.75        | 1                   |
| 7xl  | 4.5         | 1                   |
| 8xl  | 6           | 1                   |
| 9xl  | 8           | 1                   |

Use `text-xs` through `text-9xl`; body uses `text-base`. A separate `leading-*` class or `text-sm/6` overrides the associated line height. Fixed `text-[14px]` values do not follow the size scale. Prefer a standard size unless an intentional exception is necessary. Keep existing weight and tracking rules; do not silently add new shared typography tokens.

## Spacing

`--spacing` is a positive CSS length, initially `0.25rem`. Classes such as `p-4`, `gap-2`, `h-8`, `size-4`, and `w-64` multiply it by their numeric suffix.

Changing it affects padding, gaps, control/icon sizes and navigation width together. Validate typography and spacing together: text must not be clipped and targets must remain usable. Percentage, viewport, container-width and fixed-pixel values do not all use this scale. Breakpoints are unchanged.

Prefer numeric utility classes for ordinary spacing and sizes. Keep deliberate constraints such as viewport limits, images and separators when they should not scale. Do not change the root font size to simulate a density setting or introduce ad hoc height tokens.

## Radius

`--radius` is a nonnegative CSS length, initially `0.5rem`. Public utilities derive from it:

| Utility       | Multiplier |
| ------------- | ---------- |
| `rounded-sm`  | 0.6        |
| `rounded-md`  | 0.8        |
| `rounded-lg`  | 1          |
| `rounded-xl`  | 1.4        |
| `rounded-2xl` | 1.8        |
| `rounded-3xl` | 2.2        |
| `rounded-4xl` | 2.6        |

Edit the base token, not individual derived `--radius-*` variables. Zero produces square corners across these seven sizes. `rounded-full`, `rounded-xs` and explicit corners are outside this scale; small controls may intentionally cap a derived radius.

## Shadows

Define `--shadow-2xs`, `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, and `--shadow-2xl`. Values are CSS box-shadow lists, including lengths and colors; defaults match Tailwind and are recorded in `default.css`. Use `0 0 #0000` to disable a level without invalidating composed shadows.

Components use `shadow-2xs` through `shadow-2xl`. The App supplies small utility adapters because Tailwind otherwise compiles named shadows into fixed values. Preserve these adapters and their ring composition; theme edits change values only. Theme shadow values own their colors: do not rely on a separate `shadow-black/30` to recolor a variable-based shadow.

`shadow-none` intentionally opts out. Inset shadows, text shadows, drop shadows and focus rings are separate mechanisms, not these seven levels. Removing elevation must not remove keyboard focus indicators.

## Scope and verification

Each preset defines every color and non-color token in its base rule. Dark rules define all colors and may override non-color values; otherwise they inherit that preset's base. The same rules cover `.theme-preview`. Do not reset entire Tailwind namespaces or add per-page overrides to create a theme.

Reuse tokens in components before reaching for literals. Token names alone do not prove support: verify compiled utilities retain runtime references, then check actual browser styles with clearly different test values. Audit fixed typography/spacing, explicit line heights, constrained controls and portal content.

Images, iframes, third-party isolated styles and hardcoded plugin content do not automatically adapt. Extend the shared token contract only after design approval; do not change `components.json`, routes, component props, or plugin APIs as a side effect of theme authoring.
