---
'@nocobase/app-skills': patch
---

The organisation reference now seeds demonstration accounts directly into the authentication tables with `hashPassword`, and drops the workarounds for a denied `require` and for a data scope that selects nothing: the first answers 403 on its own, and the second returns an empty result.
