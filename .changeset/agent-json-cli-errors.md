---
'@nocobase/create-plugin': patch
'@nocobase/nb3-cli': patch
---

Return a single versioned JSON envelope for both successful and failed Create
Plugin and Plugin Skills synchronization commands. JSON failures keep a
non-zero exit code and now expose stable error codes, readable messages, and
actionable suggestions without appending non-JSON usage output.
