---
'@nocobase/db': patch
---

Keep a field's current type when `alterField` changes only its nullability, default or other options, instead of failing with an undefined column type.
