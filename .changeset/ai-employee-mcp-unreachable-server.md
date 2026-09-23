---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Start without an MCP server that cannot be reached, instead of failing

When the MCP client was built, one configured server that did not answer — a stopped process, a wrong URL, a network outage — made the whole connection step throw, and because that step runs at start, the application failed to start. A server that cannot be reached is now skipped with a warning in the server log naming it, the servers that did connect keep their tools, and the application starts. The same applies when an administrator switches a server on. Nothing retries in between: once the server is back, switch it off and on in AI settings, or restart. `testConnection` still reports the failure, since that is what it is for.
