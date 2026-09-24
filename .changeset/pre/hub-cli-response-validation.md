---
'@nocobase/app-template-default': patch
---

Validate Hub publishing response envelopes, release and deployment IDs, and deployment statuses. Report malformed success responses and unknown statuses as unconfirmed outcomes with exit code 3, including when waiting is disabled.
