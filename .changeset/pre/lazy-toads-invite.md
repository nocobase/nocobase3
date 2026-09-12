---
'@nocobase/app-plugin-authorization': patch
---

Publish this package. It was marked private, so it never reached the registry even though the default template depends on it and enables it, which left `pnpm install` in a generated application failing with a 404.
