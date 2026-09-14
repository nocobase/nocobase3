---
'@nocobase/db': patch
---

Fix two Policy configurations that were refused although they are legitimate: a
relation `combine` branch judged the relation's own scope as if the caller had
written it, and narrowing a `create` node with `defaults` was rejected as an
unsupported update option.

