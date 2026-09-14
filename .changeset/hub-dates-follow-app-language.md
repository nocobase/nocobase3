---
'@nocobase/app-plugin-hub': patch
---

Format dates in the language the application is in rather than the browser's. `Intl.DateTimeFormat` was constructed without a locale, which resolves to the browser's own language, so an English Hub on a Chinese browser rendered `2026年9月14日` beside its English labels — and a Chinese Hub on an English browser rendered `Sep 14, 2026`. The catalog, App detail header, Releases, Deployments and configuration history all read the application's language now.
