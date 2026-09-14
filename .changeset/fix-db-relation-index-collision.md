---
'@nocobase/db': patch
---

Prevent relation indexes from colliding with an explicitly indexed foreign-key field, and report conflicting physical index names before schema execution.

A `belongsTo` relation's automatic index is now suppressed by an index on the relation's foreign-key **column** rather than on the relation's field name, which is what removes the collision: `collection.index('productId')` alongside a `product` relation used to compile to the same physical index twice.

Suppression is also narrower than it was. Only a single-column index on that foreign key stands in for the automatic one; a composite index no longer does, even when it already leads with the same column. An application that indexed `['productId', 'scannedAt']` and relied on it to suppress the relation index will therefore see a single-column index on `productId` appear at its next schema synchronization. Declaring the same physical index name twice with different definitions now fails before execution rather than silently taking one of them.
