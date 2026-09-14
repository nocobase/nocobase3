---
'@nocobase/db': patch
'@nocobase/app-plugin-authentication': patch
---

Support local `Date` values for `date`, `time`, and `datetime` mutations while
preserving Better Auth date values when records are read through its adapter.
