---
'@nocobase/app-server': minor
'@nocobase/authorization': minor
'@nocobase/app-plugin-authentication': minor
'@nocobase/app-plugin-authorization': minor
'@nocobase/app-plugin-users': patch
'@nocobase/app-plugin-hub': minor
'@nocobase/app-template-default': minor
'@nocobase/app-template-hub': minor
'@nocobase/create-app': minor
---

Add reusable user administration and Hub-scoped role-based authorization. Authentication now supports disabled accounts, transaction-aware administration, Session revocation, and immediate Realtime disconnects. Authorization supports protected Permission Sets, atomic scoped assignment replacement, and Client permission invalidation. The Hub defines Administrator, Operator, and Viewer roles, enforces every Hub and user-management action on the server, protects the final enabled Administrator, and hides unauthorized Client controls. Both templates register the reusable Users plugin, while only the Hub template receives Hub roles and disables public sign-up.
