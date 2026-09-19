---
'@nocobase/db': minor
---

Add `narrow` to a policy-bound Repository, and publish the policy types and
`ScopedDatabaseConnection` from the package entry. Narrowing intersects scopes,
field lists and relations, and `false` on either side wins, so no patch can
widen what is already in force.
