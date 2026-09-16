---
'@nocobase/app-host': patch
'@nocobase/app-plugin-hub': patch
'@nocobase/app-template-hub': patch
'@nocobase/app-plugin-ai-employee': patch
---

Fix development startup of generated Hub applications by selecting the App Host launcher from the loaded package format, preserving source development in the workspace and using compiled JavaScript in installed packages. Correct the AI Employee plugin Skill namespace so generated applications can synchronize their registered plugins' Skills.
