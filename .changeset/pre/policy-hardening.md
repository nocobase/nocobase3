---
'@nocobase/db': patch
---

Close four ways a Policy claimed more than it enforced: a bound Repository can
no longer have its Policy replaced by another `withPolicy` call, the degraded
read type survives a Policy held in a variable of its declared type, a
malformed `through` rule is refused instead of reinterpreted as an empty
allowlist, and `explainPolicy` hands out a copy of a Date default rather than
the instance the writes read from. `validateMutation` also reports an
unsatisfiable `create.scope` instead of deferring it to the first insert.
