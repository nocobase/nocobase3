---
'@nocobase/app-server': minor
'@nocobase/db': patch
---

Let a Repository API action declare a `policy`, normalized when the routes are
defined and bound to the Repository the handler uses. `@nocobase/db` gains
`RepositoryOperations`, the operation methods a plain and a policy-bound
Repository share, so code that only runs queries can accept either.
