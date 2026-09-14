---
'@nocobase/db': patch
---

Treat a foreign key as readable when the relation it points through is
authorized and returns the key it points at. Refusing `ownerId` while allowing
`owner { id }` hid nothing, since the same value came back by the other route.
