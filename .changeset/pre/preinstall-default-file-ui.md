---
'@nocobase/app-template-default': patch
'@nocobase/app-plugin-file': patch
'@nocobase/app-skills': patch
---

Preinstall editable File Registry components and their OOXML client dependency in the Default template so applications can reuse authenticated DOCX, XLSX and PPTX previews. Clarify component reuse, dependency ownership and separate Skill/UI upgrade steps in the file and application development guidance.

Keep the shared file preview dialog wide on desktop and within the viewport on small screens, and normalize Date metadata in its refresh key for strict application linting.
