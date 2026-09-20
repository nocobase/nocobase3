---
'@nocobase/app-plugin-authorization-example': patch
---

Allow unfulfilled example orders to have a null delivery reference, fixing Oracle startup seeds and example data resets. Upgrade existing schemas with a new migration while retaining delivery-time validation. Rolling back requires filling any missing delivery references first.
