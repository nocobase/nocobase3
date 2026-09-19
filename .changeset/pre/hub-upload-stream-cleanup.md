---
'@nocobase/app-template-default': patch
---

Wait for artifact upload streams to close before publishing returns, preventing unhandled file errors when a Hub response or network failure arrives before the upload body is consumed.
