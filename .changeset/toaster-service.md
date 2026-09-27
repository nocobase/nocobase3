---
'@nocobase/app-client': minor
'@nocobase/app-plugin-hub': major
'@nocobase/app-plugin-users': major
'@nocobase/app-plugin-workflow': major
'@nocobase/app-plugin-ai-employee': major
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
'@nocobase/app-skills': patch
---

Toasts go through a toaster that `@nocobase/app-client` defines and the application implements, so code that reports a result no longer depends on how toasts are rendered.

- **App client.** `useToaster()` returns the application's `Toaster`. Its `show({ type, title, description, action, duration, id, onClose })` returns an id that `close(id)` takes, and `resolveToaster(app.services)` returns the same toaster outside React. The application registers the implementation under `toasterToken`; `@nocobase/app-client` registers none. Without one, a toast shows nothing and the first one warns in the console, and nothing throws.
- **Templates.** `client/lib/toaster.ts` forwards toasts to the Base UI `toast` manager that the mounted `Toaster` renders, and decides their presentation for the whole application: an error written as plain text is announced at once, while one carrying a control keeps the default priority. `client/service-provider.ts` registers it in `register()`. The account menu, the language switcher and the Examples route overlay demo show their toasts through `useToaster()`.
- **Plugins (breaking).** Hub, Users, Workflow and AI employee pages report through `useToaster()` instead of `Toast.useToastManager()` from `@base-ui/react/toast`, and no longer choose a toast's priority. They need the `@nocobase/app-client` that exports it, and the application has to register a toaster: without one their pages keep working but show no toasts. They no longer require a Base UI `Toast.Provider`.
- **Skills.** The frontend references and each affected plugin's Skill describe `useToaster()`, and the `nocobase-app-upgrade` edge case "Notifications and the application toaster" replaces "Notifications and the Base UI toast".

Upgrade an existing application with the `nocobase-app-upgrade` Skill, which brings `client/lib/toaster.ts` and its registration together with the new `@nocobase/app-client` and plugin ranges; follow the same steps when upgrading by hand.
