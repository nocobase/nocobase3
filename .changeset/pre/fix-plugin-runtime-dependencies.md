---
'@nocobase/nb3-cli': patch
'@nocobase/app-skills': patch
---

Register all application plugins as production dependencies so they reach deployments, migrate legacy development declarations, and preserve declared version ranges when registering existing plugins.

Document plugin dependency placement and migration in the shared application development Skill.
