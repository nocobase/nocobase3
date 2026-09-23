---
'@nocobase/app-plugin-ai-employee': patch
---

Authorize a file preview before reading the file

`aiFiles:preview` opened the stored file before deciding whether the caller could read it, so a refused request still opened a file handle or issued a read to remote storage and left it unconsumed. It now looks up the file's record, decides on the uploader and the caller's AI settings access, and opens the content only when the preview is allowed. Responses are unchanged.
