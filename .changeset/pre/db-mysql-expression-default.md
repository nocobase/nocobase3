---
'@nocobase/db-mysql': patch
---

Read the value of an expression default from `information_schema`

MySQL reports an expression default — which every defaulted `json` column has, since MySQL accepts no literal default on `json` — as the expression it evaluates, `_utf8mb4\'{"enabled":true}\'`, rather than as a value. The shared literal parser did not recognise the character-set introducer or the backslash-escaped quotes, so the inspector returned the default's expression without a value and a resolved json Field carried no `defaultValue`. The introducer is now stripped and the escapes undone before parsing, so the default reads as the `'...'` literal it stands for.
