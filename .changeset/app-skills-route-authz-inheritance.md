---
'@nocobase/app-skills': patch
---

Describe route `authz` inheritance and defaults in the frontend references

The page, child route, overlay, frontend development, testing and authorization references no longer say that every page must declare `authz` or that registration rejects a page without it. They describe the current rule: declare `authz` on the first page of every path; a nested page that omits it inherits its nearest ancestor page's value; a first page that omits it still registers, with a development warning, as unrestricted-only (root) on protected App and settings pages and as `'skip'` on guest, optional and dev pages. They recommend always declaring it and document `'unrestricted'` as an explicit root-only value that is never offered as a grant.
