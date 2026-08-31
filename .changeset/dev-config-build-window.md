---
'@nocobase/dev-config': patch
---

Keep `dist` readable while it rebuilds. The build deleted the directory before compiling, so a package linting in parallel could fail to resolve `@nocobase/dev-config/eslint` during that window. The output is now staged and swapped in once compilation succeeds, which also leaves the last good build in place when compilation fails.
