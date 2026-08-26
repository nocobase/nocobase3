---
'@nocobase/create-app': patch
---

Add `--template-tag` to choose which channel a named template is fetched from, `latest` (the default) or `beta`. A template given as a package specifier or a local path is unaffected, since it already says which version to use.
