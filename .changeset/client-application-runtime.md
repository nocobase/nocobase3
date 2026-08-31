---
'@nocobase/app-client': minor
---

Introduce the stateful ClientApplication with application-scoped services, ServiceProvider lifecycle management, static Client contributions, read-only runtime configuration, React Providers, and application-owned startup and shutdown boundaries. Keep the React DOM root in the Browser host, which renders `AppClientRoot` after application startup.

Remove the Client bootstrap and lazy contribution-loader contracts. Rename the React tree contribution to `reactProviders` and add the cross-runtime `serviceProviders` contribution.
