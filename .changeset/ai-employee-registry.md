---
'@nocobase/app-client': patch
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
---

Publish the application-owned AI Employee frontend Registry with its chat components and development showcases. The Registry now uses the application-scoped `@nocobase/app-client` transport for JSON, upload, and streaming requests instead of the deprecated Portal SDK client. The Default and Hub templates scan plugin Registry source for Tailwind utilities, so materialized and development-preview components retain their intended responsive layout and sizing.
