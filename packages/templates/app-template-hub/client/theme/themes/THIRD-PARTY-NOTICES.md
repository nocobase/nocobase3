# Third-party notices

## tweakcn theme presets

The theme files listed below are derived from [tweakcn](https://github.com/jnsahaj/tweakcn), specifically `utils/theme-presets.ts` at commit `a3b47b37cba97dd637de517aab52c45ec0f83456`, which is published under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
The Apache License 2.0 requires that this provenance travels with the derived work.

Each `client/theme/themes/<id>.css` carries the upstream colours and corner radius for the preset of the same id:

- `modern-minimal` (Modern Minimal)
- `violet-bloom` (Violet Bloom)
- `mocha-mousse` (Mocha)
- `bubblegum` (Bubblegum)
- `amethyst-haze` (Amethyst Haze)
- `notebook` (Notebook)
- `graphite` (Graphite)
- `perpetuity` (Perpetuity)
- `kodama-grove` (Kodama Grove)
- `cosmic-night` (Cosmic Night)
- `tangerine` (Tangerine)
- `quantum-rose` (Quantum Rose)
- `nature` (Nature)
- `bold-tech` (Bold Tech)
- `elegant-luxury` (Elegant Luxury)
- `amber-minimal` (Amber Minimal)
- `neo-brutalism` (Neo Brutalism)
- `solar-dusk` (Solar Dusk)
- `claymorphism` (Claymorphism)
- `cyberpunk` (Cyberpunk)
- `pastel-dreams` (Pastel Dreams)
- `clean-slate` (Clean Slate)
- `caffeine` (Caffeine)
- `ocean-breeze` (Ocean Breeze)
- `retro-arcade` (Retro Arcade)
- `midnight-bloom` (Midnight Bloom)
- `candyland` (Candyland)
- `northern-lights` (Northern Lights)
- `vintage-paper` (Vintage Paper)
- `sunset-horizon` (Sunset Horizon)

The conversion keeps this application token contract rather than the upstream one.
Upstream font families, font sizes, letter spacing, spacing, and shadow colour, offsets, blur, spread and opacity are not carried over, so a converted preset uses this application font stacks, including its CJK fallbacks, and needs no font files or font packages from the upstream project.
Only the colours and the corner radius differ from `client/theme/themes/default.css`.

`bubblegum` is the one preset whose colours are not carried over verbatim. Upstream spends the generic surface and outline roles on decoration, which this application's token contract reserves for structure: `--card` was `#fdedc9`, a cream 101 degrees of hue away from the pink `--background`; `--border` was `--primary` itself, at chroma 0.18 against a median of 0.02 across these presets; and `--muted` was the cyan `#b2e1eb`. Six light values are retuned as a result — `--card`, `--border`, `--muted`, `--input`, `--sidebar-border` and `--sidebar-primary` — keeping those roles in the background's hue family and leaving the preset's colour in `--primary`, `--secondary` and `--accent`. The dark values and the corner radius are unchanged, as are every other preset's colours. The header comment in `bubblegum.css` records the same thing next to the values.
