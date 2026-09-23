---
'@nocobase/ai-employee': patch
---

Keep MCP connection URLs out of the log

The warning logged when an MCP server cannot be reached, and the error logged when the client cannot be initialized, now carry the server name and a short reason in which any URL is reduced to its origin. Previously they carried the whole connection error, which quotes the server's full URL.
