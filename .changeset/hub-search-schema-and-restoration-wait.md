---
'@nocobase/app-plugin-hub': patch
---

Scope the App catalog search to the Collection's database schema so it works on PostgreSQL outside the default schema, and bound how long Hub reads wait for startup restoration so a stuck App no longer hangs the catalog; Apps the Host has not reached yet are reported as pending in the meantime.
