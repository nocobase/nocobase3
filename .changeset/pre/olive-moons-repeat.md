---
'@nocobase/create-app': patch
---

Point the default template at the `latest` dist-tag instead of `beta`. changesets leaves `beta` on a package's first published version while tagging every release since as `latest`, so `beta` named the oldest template rather than the newest, and scaffolding from it produced an app missing settings that later releases added to `.env.example`.
