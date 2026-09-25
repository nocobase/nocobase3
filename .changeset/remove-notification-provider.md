---
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
'@nocobase/app-plugin-hub': minor
'@nocobase/app-plugin-users': minor
'@nocobase/app-plugin-workflow': minor
'@nocobase/app-plugin-ai-employee': minor
'@nocobase/app-skills': patch
---

Remove `@nocobase/app-plugin-notification-provider` and show every notification through the Base UI toast the templates already ship. The package is no longer published, and Sonner is no longer a dependency of anything.

- **Templates.** `client/react-providers.ts` mounts the `Toaster` from `client/components/ui/toast.tsx` once, in the `application` layer, and the account menu and language switcher call `toast.add` from `@/components/ui/toast`. The plugin and `sonner` leave `client/plugins.ts` and `package.json`, and no Refine notification provider is registered.
- **Plugins.** Hub, Users, Workflow and AI employee pages report through `Toast.useToastManager()` from `@base-ui/react/toast` instead of Sonner or Refine's `useNotification()`, so they now require the application to mount a Base UI `Toast.Provider`; without one they fail with `Base UI: useToastManager must be used within <Toast.Provider>`. Hub notifications appear where the application's toaster places them rather than top-right. `sonner` and `@refinedev/core` are no longer peers.
- **Skills.** The frontend references describe `toast.add` from `@/components/ui/toast` in place of Sonner.

Upgrading an existing application means mounting the toaster before taking the new plugin versions: see "A removed plugin the diff cannot remove for you" in the `nocobase-app-upgrade` Skill (`packages/app/app-skills/skills/nocobase-app-upgrade/references/edge-cases.md`).
