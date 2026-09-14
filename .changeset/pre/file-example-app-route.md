---
'@nocobase/app-plugin-file-example': patch
'@nocobase/app-plugin-file': patch
---

Serve the File Repository example at /file-repository

The example no longer contributes a development-only `/dev/file-repository` page. It now declares `/file-repository` through `defineAppRoutes()` with `auth: 'required'`, so the page shows up in the application navigation, matches the Examples template home card, and is part of a production build. Page access follows the application's page permissions, while the example's Server routes stay public. The File plugin's documentation points at the new path, and its Agent Skill no longer describes the example package; that guidance lives in the example's own Skill.
