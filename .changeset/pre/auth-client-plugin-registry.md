---
'@nocobase/app-plugin-authentication': minor
---

Add `AuthClientPluginRegistry`, an augmentable interface that decides what `AuthClient` is typed as.

The Better Auth client is created inside this package from the application's config, so its type could never be inferred from the plugins the application actually passes. `AuthClient` was pinned to `usernameClient` instead — too narrow for any plugin an application adds, and a plugin that added one had no way to say so except a cast. A plugin package now augments the registry with its client plugin, and `AuthClient` carries it:

```ts
declare module '@nocobase/app-plugin-authentication/client' {
  interface AuthClientPluginRegistry {
    'api-key': ReturnType<typeof apiKeyClient>;
  }
}
```

This is the same mechanism Better Auth uses for its own server-side plugin registry. Nothing changes for an application that adds no client plugins: the registry seeds `username`, so `AuthClient` is what it was.
