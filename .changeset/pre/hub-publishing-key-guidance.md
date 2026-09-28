---
'@nocobase/app-skills': patch
---

Document where a Hub publishing key comes from in the application development Skill. `HUB_API_KEY` was named as a required variable without saying that it is created on Hub's API Keys page, bound to selected applications, and scoped to `upload-release`, `deploy`, or both, so agents and users had to find the entry point and permissions elsewhere.
