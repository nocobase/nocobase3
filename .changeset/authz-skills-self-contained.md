---
'@nocobase/app-skills': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
---

Split the organisation dimension reference into an entry page and sub-references for the model and service, the settings page, subjects with attribute sync and seeds, and testing, and inline the attribute sync and demonstration account seed code. The authorization Skills no longer send readers to the example plugins: they route organisation work to the application development Skill and use neutral `org.team` subject ids.
