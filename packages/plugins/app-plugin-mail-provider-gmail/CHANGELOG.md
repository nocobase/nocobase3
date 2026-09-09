# @nocobase/app-plugin-mail-provider-gmail

## 0.0.1

### Patch Changes

- Add Gmail OAuth, sending, paginated initial sync, and History incremental sync.
- Preserve terminal OAuth refresh errors so Mail Core can request
  reauthorization instead of retrying indefinitely.
- Use a message-backed Gmail history cursor and scan the complete mailbox
  without intersecting every discovered label.
- Fall back to a bounded message scan when Gmail History records are
  unavailable.
