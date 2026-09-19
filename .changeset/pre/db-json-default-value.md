---
'@nocobase/db': patch
---

Resolve a json column's default to the document it encodes

`connection.collections.get()` reported a json Field's `defaultValue` as the text between the quotes of the SQL literal — `'{"storage":"local"}'` came back as the string `{"storage":"local"}` — while the Builder had been given the object. The inspector parses defaults at the literal level and does not know the column's type, so the resolver now decodes the text for `json` columns; the physical literal stays in `db.defaultExpression`. A default that is not valid JSON keeps `defaultValue` unset and adds a `COLLECTION_JSON_DEFAULT_INVALID` resolution warning instead of failing.
