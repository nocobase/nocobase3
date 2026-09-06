---
'@nocobase/db': minor
---

Return a lazy, awaitable and asynchronously iterable query from Repository findMany. Repeated promise consumption shares one execution; mixing consumption modes or repeating iteration raises QUERY_ALREADY_CONSUMED.
