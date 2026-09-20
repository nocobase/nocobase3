---
'@nocobase/app-plugin-notification-in-app': patch
---

Migrate inbox timestamps to timezone-aware datetime fields so stored UTC notifications can be read and marked as read without temporal validation errors.

Validate recipient existence at final in-app delivery and reject missing users with a non-retryable recipient error. Custom database Provider factories must supply a recipient existence resolver.

Show an end-of-list message when the inbox has no more notifications to load.

Load the next inbox page automatically near the bottom, with duplicate-request protection and cancellation when filters or refreshed data change.

Keep the channel badge aligned with the title and collapse long message bodies to three lines with expand and collapse controls.
