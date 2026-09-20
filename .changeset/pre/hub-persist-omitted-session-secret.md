---
'@nocobase/app-plugin-hub': patch
---

Generate and persist a session secret for Config file deployments and configuration publications even when the session section is omitted. Reuse existing secrets on subsequent operations and preserve custom values. Existing applications using a runtime-only session secret receive a stable secret on the next deployment or configuration publication, invalidating cookies encrypted with the previous secret.
