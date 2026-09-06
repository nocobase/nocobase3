# Database

`migrations/202609060001_repository_example_create_crm.ts` explicitly creates five CRM/order example collections and their relationships. It is reversible and self-contained.

`seeds/202609060001_repository_example_demo.ts` inserts 4 customers, 5 contacts, 6 products, 4 orders and 8 order items, with fixed IDs and values. Parent records precede children, and all inserts run in one transaction. Existing IDs are preserved; a conflicting unique SKU/order number rolls back the entire seed.

Run the owning application's `pnpm migrate`, then `pnpm seed`. The seed runner records completion, so later runs skip it and retain user edits and deletions. Once the migration has been merged and published, subsequent schema changes require a new migration.

`migrations/202609060002_repository_example_atomic_counters.ts` adds the independent numeric counter table. `seeds/202609060002_repository_example_atomic_counters.ts` creates stock (120), wallet balance (50000 cents), points (100) and visits (0) examples using stable IDs. Both files are separate from the existing CRM migration and seed.
