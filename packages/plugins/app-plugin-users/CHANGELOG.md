# @nocobase/app-plugin-users

## 0.0.2-beta.0

### Patch Changes

- e3fa827: Add reusable user administration and Hub-scoped role-based authorization. Authentication now supports disabled accounts, transaction-aware administration, stable duplicate-identity conflicts, Session revocation, and immediate Realtime disconnects. Authorization supports protected Permission Sets, atomic scoped assignment replacement, and Client permission invalidation. The Users page supports protected role options, readable multi-role editing, explicit unassigned states, and a distinction between direct roles and authenticated-user defaults; password reset and database Session revocation share one transaction. The default App exposes its direct Authorization Permission Sets as application roles while keeping System administrator changes in Authorization. The Hub defines Administrator, Operator, and Viewer roles, batch-loads their user assignments, enforces every Hub and user-management action on the server, protects the final enabled Administrator, and hides unauthorized Client controls. Both templates register the reusable Users plugin; Hub exposes Applications, User management, and a read-only role matrix directly in its control-plane navigation, while the default App keeps Users in Settings. Only the Hub template receives Hub roles, disables public sign-up, and omits ordinary App Settings, workflows, notifications, and example plugins.
- Updated dependencies [e3fa827]
- Updated dependencies [c3e02bf]
- Updated dependencies [0a3fa83]
- Updated dependencies [1d042c0]
  - @nocobase/app-server@1.0.0-beta.9
  - @nocobase/authorization@0.1.0-beta.4
  - @nocobase/app-plugin-authentication@0.1.0-beta.10
  - @nocobase/app-plugin-authorization@0.2.0-beta.9
  - @nocobase/app-client@1.0.0-beta.12
  - @nocobase/db@1.0.0-beta.4

## 0.0.1

### Patch Changes

- Add reusable user administration APIs and a configurable management page,
  with server-side action authorization, transactional application role scopes,
  account state changes, password reset, and Session revocation.
