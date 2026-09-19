---
'@nocobase/app-template-examples': minor
---

Add an external database example

The `externalCrm` connection reads a database another system owns: `schemaManagement: 'external'` keeps NocoBase from changing its schema, `naming` maps the CRM's `crm_`-prefixed tables to logical Collection names, and a `ModuleCollectionMetadataStore` fed from `database/externalCrm/metadata.ts` supplies titles and the `orders.customer` relation the schema cannot express. Two read-only repository routes, `crmCustomers` and `crmOrders`, expose it to signed-in users, and an **External CRM** page lists the orders with their customers through them.

The connection points at a local SQLite file so the example runs without a real CRM; a provider plays the foreign system and creates the tables and sample rows when they are missing, and does nothing once the connection is pointed elsewhere.
