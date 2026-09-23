---
"@nocobase/app-plugin-notification": minor
"@nocobase/app-plugin-notification-in-app": minor
"@nocobase/app-plugin-notification-providers": minor
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
"@nocobase/app-skills": patch
---

Replace notification configuration with named single-Provider Channels and send complete messages through a Channel-keyed map. Validate all messages before enqueueing, deliver native recipients independently, and retain retries bound to the original Channel and Provider. Simplify the test form and remove Provider instance names from delivery records with a new migration.
