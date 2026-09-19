# Customer audit example database

The explicit migration creates customer records with owner-based access and optimistic versioning, and operation records containing mapped audit events plus ownerId. Operation rows have no foreign key to customers so deletion retains history. Rollback drops both tables and metadata; it is destructive and intended only when deliberately removing this demonstration data. Migration tests verify up/down against SQLite.
