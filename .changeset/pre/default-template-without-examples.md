---
'@nocobase/app-template-default': minor
'@nocobase/app-plugin-notification-provider': minor
---

Make Default a clean application starting point: remove all nine example plugins, article/demo pages, sample services and APIs, article migrations and seeds, unused article UI primitives, and obsolete starter dependencies. Keep product capabilities and a localized homepage, with empty application database task directories. Document preserving existing application-owned history during source upgrades. Runnable demonstrations remain in Examples.

Add a notification provider `demo` option so Default can omit the notification demonstration page while retaining notification services and the global host. Existing registrations keep their current behavior.
