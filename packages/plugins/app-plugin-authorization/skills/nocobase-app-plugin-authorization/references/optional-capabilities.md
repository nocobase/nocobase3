# Optional authorization capabilities

Permission sets, page authorization, composite declarations, workspace placement and database policy enforcement belong to the main authorization plugin. Default access, sharing rules and restriction rules are separate optional plugins.

| Requirement                                                       | Installed Skill                               |
| ----------------------------------------------------------------- | --------------------------------------------- |
| A common record baseline for holders of an action                 | `nocobase-app-plugin-authz-default-access`    |
| Additional records for selected collaborators who hold the action | `nocobase-app-plugin-authz-sharing-rules`     |
| Narrow granted records for selected subjects                      | `nocobase-app-plugin-authz-restriction-rules` |

Before designing with one of these capabilities, locate and read its Skill in the current App's `.agents/skills/`. If the corresponding Skill cannot be found, treat the capability as unsupported in this App and tell the user it requires separate development. Do not assume the example's plugin composition is present, invent an API, write its tables, or silently add a dependency/config factory. Continue independent work on supported capabilities; do not silently omit a required access boundary.

Finding the Skill is the development entry point, not proof of runtime activation. Follow that Skill to verify the package, client/server registrations, authorization configuration and migrations. A present but unconfigured plugin must be integrated according to its instructions before use.

Each owning Skill contains its installation, builders, service APIs, management routes, seed persistence and verification. Seeded business rules remain editable in the backend. The main Skill does not define optional-plugin storage contracts.

When configured, defaults and sharing add positive record scopes; restrictions narrow them. None grants a missing business action, page or field capability. Use the owning Skill for precise scope and relation boundaries.
