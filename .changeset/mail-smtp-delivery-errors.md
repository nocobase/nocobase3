---
'@nocobase/app-plugin-mail': patch
---

Correct SMTP temporary and permanent failure classification and preserve unknown delivery status after transport timeouts. Keep attachment preparation failures classified as unsent, add regression coverage for mail persistence, ownership, logs, and the client-to-database delivery flow, and enforce coverage thresholds in the plugin's default test command.
