---
'@nocobase/app-plugin-mail': patch
---

Fix IMAP synchronization silently importing no messages when a server omits UIDNEXT. Derive the cursor from the last message UID for nonempty mailboxes, recover previously empty incremental cursors, and report unreadable UID metadata as synchronization errors.
