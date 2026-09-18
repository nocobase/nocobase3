---
"@nocobase/authorization": minor
"@nocobase/app-plugin-authorization": minor
"@nocobase/app-plugin-authorization-example": patch
---

Add composable, typed authorization builders with plugin-owned page and database grants, immutable scopes, and record-access policy registration. Support portable build/reference/register APIs and pure permission-set and rule DSL builders. Convert the sales example and its per-table seed data to shared fluent declarations while preserving authorization behavior.

Separate page entry permissions from business data operations. Expose registered pages independently in permission sets and the inspector, and restrict business composition to database grants.
