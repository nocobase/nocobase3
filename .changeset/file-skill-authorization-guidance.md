---
'@nocobase/app-plugin-file': patch
---

Clarify the authorization guidance in the File plugin Agent Skill: register App-owned authentication and authorization on the paths each route contribution owns, rather than a catch-all router middleware that would also guard the SPA and every contribution mounted after it.
