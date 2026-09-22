---
'@nocobase/app-skills': patch
---

Name the AI Employee plugin in the application development Skill's capability map

`nocobase-app-development` is where an agent starts almost every application feature, and its "Check the installed plugins first" table is how it learns that a capability already has a plugin behind it. The table listed workflow, notification, authorization, authentication, file, i18n, users and `@nocobase/db`, and said nothing about AI.

So a request like "let an assistant read the file I dropped in and create a record" went straight to hand-written code. `@nocobase/app-plugin-ai-employee` ships its own Skill, that Skill synchronizes into every application depending on the plugin, and nothing in the agent's path mentioned it existed — the one lookup table that would have was silent.

It now has a row: an assistant in the application, chat, reading files dropped into it, and acting through tools the application defines.
