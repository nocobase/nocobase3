---
"@nocobase/app-server": patch
"@nocobase/app-plugin-authorization": minor
"@nocobase/app-plugin-authorization-example": patch
"@nocobase/app-skills": patch
---

Add business-action authorization middleware for existing Repository route definitions. Intersect request constraints with endpoint policies, reject incomplete multi-scope shortcuts, and demonstrate project queries and editing in the authorization example. The example's project edit now uses `salesProjects:updateOne` with Repository input/output and 404 for out-of-scope targets.

Document when to use generated CRUD versus custom business handlers in the authorization development Skill. Remove the separate authorization example Skill and its package publication entry.

Remove the collection-aggregated `authz.db.repositories` adapter and its public types. Use `authz.db.authorizeRepository` with explicit business-action mappings for generated Repository routes.
