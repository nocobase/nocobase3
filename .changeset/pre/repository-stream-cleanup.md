---
'@nocobase/db': patch
---

Wait for Repository streams to close before completing iterator cleanup, preventing delayed connection release after database pool teardown.
