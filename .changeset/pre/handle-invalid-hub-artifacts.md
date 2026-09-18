---
'@nocobase/app-plugin-hub': patch
---

Reject unsafe, linked, or oversized release metadata through the upload error boundary instead of throwing from tar stream callbacks and terminating Hub. Clean temporary files before returning the validation error.
