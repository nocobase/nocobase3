---
'@nocobase/app-plugin-file': patch
'@nocobase/app-template-default': patch
'@nocobase/app-plugin-file-example': patch
---

The Registry preview now embeds a PDF as a blob retyped to `application/pdf` and refuses a response that carries an active markup type, so a content route answering with an HTML error or login page can no longer become a same-origin document inside the preview frame; the file example's preview dialog applies the same rule. The file Skill describes that path instead of calling it "PDF via a fetched blob", and its preview verification list now covers PDF, including a headed-browser check that the top-level URL, the page and the session survive a preview.
