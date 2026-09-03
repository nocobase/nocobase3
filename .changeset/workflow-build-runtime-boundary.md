---
'@nocobase/app-plugin-workflow': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
---

Move Workflow source parsing and Artifact generation behind the `workflow build` command. The command uses Node's native TypeScript loading in a disposable process, removing esbuild entirely while production servers continue to install or load neither build modules nor TypeScript.
