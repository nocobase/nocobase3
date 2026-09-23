---
'@nocobase/ai-employee': patch
'@nocobase/app-plugin-ai-employee': patch
---

Refuse a permission for an MCP tool that is not connected

Setting the permission of an MCP tool that no connected server exposes now fails instead of reporting success. `aiMcpServers:updateToolPermission` answers 404 for such a tool, and `MCPServerManager.updateMCPToolPermission()` throws when the tool's server is not connected or not saved, rather than keeping the choice in memory until the next restart.
