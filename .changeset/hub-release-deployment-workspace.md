---
'@nocobase/app-plugin-hub': patch
---

Combine release uploads and deployment history in one permission-aware workspace, add per-release deployment actions and collapsible release lists, and open each submitted deployment's live logs in a URL-addressable drawer.

Derive the latest-upload badge and deployment emphasis from persisted releases and the active release so they survive refreshes; show upload confirmation as a temporary notification.

Refresh deployment history immediately after an accepted submission, even if the overview refresh fails, and require configuration read permissions before offering the deployment action.
