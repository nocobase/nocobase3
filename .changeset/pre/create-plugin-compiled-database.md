---
'@nocobase/create-plugin': patch
---

Stop listing the `database` source directory in a generated plugin's `files`. Its TypeScript already compiles into `dist/database`, which is what the runtime resolves; publishing the sources beside it shadowed the compiled copy and left the generated plugin unable to run its own migrations once installed, because Node refuses to strip types under `node_modules`.
