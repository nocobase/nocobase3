# Examples template upgrades

This application starts from `@nocobase/app-template-examples`. Its initial release is based on the current Default template and includes the same framework structure, multi-connection database tasks, and example plugins, plus an examples homepage and article management.

In the template package, `nocobase.defaultTemplateVersion` mirrors `version`; `scripts/sync-template-version.mjs` updates it during release. In a generated application, it records the template version whose source changes have been incorporated. Changing the number alone never upgrades source files.

## System information plugin removed

`@nocobase/app-plugin-system-info` has been removed from the source workspace and template registrations. Remove its manifest entry and client/server registrations when upgrading a derived application, then reinstall dependencies and synchronize plugin Skills. The `/system-info` page and `/api/system-info` endpoint are no longer available.

## File plugin removed from template registration

The template no longer registers or directly depends on `@nocobase/app-plugin-file`. Its file inventory settings page and related API are no longer provided by default. When merging this update, remove the package from the manifest and both client/server plugin lists, then install dependencies and synchronize plugin Skills. This registration change does not delete stored files or database records. Independently registered file Repository capabilities remain unchanged.

## Remove duplicate plugin metadata

Remove `nocobase.plugins` from the application manifest after upgrading the CLI and template scripts together. Keep `templateKind` and `defaultTemplateVersion`. Client, Server, and CLI composition roots now determine registered plugins for bulk Skills synchronization and updates. Development watches read Server registrations; deployment packaging follows server imports. Registration still copies plugin Skills, and unregistration cleans up legacy metadata when present.

## Upgrade checklist

1. Back up application source and its database before upgrading.
2. Review the template changelog and merge the framework changes into your application.
3. Preserve customized pages, plugin choices, locales, configuration, and runtime data.
4. Keep previously executed migration and seed sources unchanged. New database changes require new files.
5. Install dependencies, run checks and build, then verify login, navigation, permissions, article CRUD, and database task history.
6. Update `nocobase.defaultTemplateVersion` only after the source upgrade is complete.

## Independent application state

Creating Examples from Default means copying source conventions, not moving a running database. Use a fresh configuration and database for each generated application. Do not point Examples at an existing Default database: migrations and seeds are tracked by package identity, so changing template identity does not transfer their history.

Default remains unchanged by the introduction of this template. Moving a previously running Default application to Examples is a separate source and database migration, not a directory rename.
