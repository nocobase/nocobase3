---
'@nocobase/db': patch
---

Reject a dotted field name in a Policy scope when the Policy is bound, the same
way an explicit relation path already was. `{ 'owner.tenantId': 'T1' }` kept the
dotted name as one path segment, so it slipped past the relation check and
failed much later as an unknown field.
