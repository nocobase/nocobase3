---
'@nocobase/app-plugin-ai-employee': patch
---

Remove cross-feature tabs from AI Employee settings and its exported shell wrappers while preserving internal employee detail/editor tabs. Redirect legacy knowledge-base and vector-database tab URLs to their independent settings paths, preserving unrelated query parameters and hashes. Keep the tab registry and shell props as deprecated compatibility APIs without rendering contributed tabs; migrate custom tab contributions to Settings routes with parent `aiGroup`. Knowledge-base list/vector path helpers now target the standalone pages and require the owning Knowledge Base plugin's corresponding route update.
