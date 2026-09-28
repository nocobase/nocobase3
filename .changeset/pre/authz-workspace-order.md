---
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
---

List Permission Sets first and the Permission Inspector last in the authorization settings subsection, with the rule plugins between them. `authz.ui.place` accepts an optional `order` within a subsection; unordered resources follow in registration order. The permission workspace now shows a resource's key under its name, and its sidebar leads with subsections, keeping section headers as muted labels.
