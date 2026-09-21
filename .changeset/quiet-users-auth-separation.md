---
'@nocobase/app-plugin-users': major
'@nocobase/app-plugin-authentication': major
'@nocobase/app-plugin-user-management': minor
'@nocobase/app-plugin-hub': patch
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/db': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Split the user identity storage contract from authentication and introduce the user-management package boundary. Authentication user operations now route through the users storage contract, and database transactions expose post-commit effect registration for lifecycle work. Application templates register `@nocobase/app-plugin-user-management` for the management pages and API alongside the base users plugin.
