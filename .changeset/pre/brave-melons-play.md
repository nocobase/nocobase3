---
'@nocobase/create-app': patch
---

Set `trustLockfile` in generated applications, so installs stop re-auditing every lockfile entry against the supply-chain policy each time. The check queries registry metadata per package and re-verifies versions the lockfile already pins; newly resolved packages are still checked.
