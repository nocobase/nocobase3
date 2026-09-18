---
"@nocobase/authorization": patch
"@nocobase/app-plugin-authorization": patch
---

Run permission assignment revocation and replacement in a transaction, hold protected permission set locks before reading assignments, and notify permission changes only after commit. Concurrent removals can no longer delete the last active administrator assignment.
