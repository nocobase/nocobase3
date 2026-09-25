---
'@nocobase/app-plugin-departments-example': patch
---

Seed the demo accounts directly into the authentication tables, with a hashed password, instead of creating them when the plugin starts. The demo now shows multi-level inheritance, a Sales grant that Support does not receive, a user in two departments, and a permission set assigned directly to a user that survives revoking the department grant. The routes rely on the framework for a denied `require` and for a data scope that selects nothing.
