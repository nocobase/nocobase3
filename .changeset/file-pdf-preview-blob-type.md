---
'@nocobase/app-plugin-file': patch
'@nocobase/app-template-default': patch
'@nocobase/app-plugin-file-example': patch
---

The PDF preview, in the Registry components and the file example, now embeds the fetched file as `application/pdf` and refuses an HTML, SVG or XML response, so a content route answering 200 with a login page or SPA fallback can no longer run as a same-origin document in the preview frame. A PDF served as `application/octet-stream` now previews instead of downloading. The file Skill's preview checklist now covers PDF.
