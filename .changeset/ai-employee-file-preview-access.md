---
'@nocobase/app-plugin-ai-employee': patch
---

Base AI file previews on the uploader and AI settings access

`aiFiles:preview` returns a file to the user who uploaded it. Anyone else, and any file that records no uploader, now needs access to the AI settings page — the access the conversation center already requires to show other users' conversations. The session's `isRoot` and role names are no longer consulted, since the authorization service is what grants access. An administrator who previewed other users' attachments through a root flag needs AI settings access instead.
