---
'@nocobase/app-template-examples': patch
---

Keep the external CRM example's metadata in `metadata.json` files

The `externalCrm` connection no longer constructs a `ModuleCollectionMetadataStore` from TypeScript documents. Its metadata lives in `database/externalCrm/collections/{customers,orders}/metadata.json`, the default source for an external connection, so the connection is configured by `dialect`, `schemaManagement` and `naming` alone. The build copies these files into `dist/database` so a deployment resolves the same titles and relations.
