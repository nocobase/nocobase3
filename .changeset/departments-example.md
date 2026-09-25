---
'@nocobase/app-plugin-departments-example': patch
---

Add a departments example: a department tree with memberships and a primary department, disabled rather than deleted, registered with authorization as the `org.department` inherited subject type with `members` and `manage`. It adds Settings → Organization with a department member panel, a department directory page authorized through the `org.directory` composite and the `org.ownDepartments` record access, seeds a demo tree with its permission sets, assignments and demo accounts.
