---
'@nocobase/drive': minor
---

Drop `links` from `AppDriveConfig` and stop creating symlinks in `prepareDriveStorage`, which now takes no options and returns only `directories`.

The change itself landed with the Hub deployment work, but only the packages on the other side of it were released: `@nocobase/app-server` shipped as `1.0.0-beta.7` without `links` in its drive configuration, while `@nocobase/drive` stayed at the previously published `0.1.0-beta.2`, whose `prepareDriveStorage` still reads `config.links`. An application installing both from the registry gets that pair — `app-server` declares `^0.1.0-beta.2`, so nothing rejects it — and crashes on boot with `TypeError: Cannot convert undefined or null to object` from `Object.entries(config.links)`. Releasing this package is what makes the two halves agree again.
