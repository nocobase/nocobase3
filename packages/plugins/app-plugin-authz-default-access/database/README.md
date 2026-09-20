# Database resources

This plugin owns the migration in `migrations/` for default record-scope rules. The application discovers it through the server plugin's absolute `baseDir` and executes it through its normal migration lifecycle. Run application migrations after registering the plugin; do not create or modify these tables from a business feature.

The plugin does not seed business rules. Configure initial rules through the public service API in controlled application provisioning, or use the authorization settings UI. Preserve administrator changes when provisioning runs again. See the [package API](../README.md) and the authorization example's rule declarations for usage.

Migrations are immutable after their introducing branch is merged. Add a new migration for schema changes, and verify both the physical schema and metadata with a migration test. Build generates the database manifest alongside compiled migrations; consumers execute the published resources.
