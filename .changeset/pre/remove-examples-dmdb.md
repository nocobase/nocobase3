---
'@nocobase/app-template-examples': patch
'@nocobase/db-oracle': patch
'@nocobase/app-plugin-file-example': patch
---

Remove the Dameng/DMDB driver from the examples application so its default development configuration uses SQLite without requiring a local DMDB service, and provide a development Docker Compose file for the supported server-backed database dialects. Improve Oracle schema normalization so repeated nullable column changes are skipped across all column types, map integers with enough precision for the full 32-bit range, and accept the application's ISO timestamp seed format.
