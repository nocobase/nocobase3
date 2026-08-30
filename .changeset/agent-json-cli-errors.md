---
'@nocobase/create-plugin': patch
'@nocobase/nb3-cli': patch
---

Return a single versioned JSON envelope for both successful and failed Create
Plugin and Plugin Skills synchronization commands. Plugin Skills
synchronization now includes consistent success and failure statuses. JSON
failures keep a non-zero exit code and expose stable error codes, readable
messages, and actionable suggestions without appending non-JSON usage output.
