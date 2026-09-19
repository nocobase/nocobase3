---
"@nocobase/authorization": minor
"@nocobase/app-plugin-authorization": minor
"@nocobase/app-plugin-authorization-example": minor
---

Add independent Policy-shaped relation permission declarations and immutable fluent builders, resolve target record scopes, and require explicit relation grants when narrowing repository API policies. Extend the sales authorization example with delivery-team associations, nested delivery checks, many-to-many collaborator notes, and an interactive relationship editor.

Replace the business resource and collection/page declaration factories with callback-based authorization resources and reusable database permissions. Bind configuration keys at the action boundary, retain direct registration, and migrate the sales example without changing persisted grant or rule shapes.

Move record access registration to the authorization core, add portable defineRecordAccess declarations, and consume repository-input FilterAst values only in the DB adapter. Migrate the sales example and policy selectors to generic resource references.

Remove obsolete Business-prefixed public contracts and unused page/registry-bound builder entry points. Keep resource grant construction internal to the authorization package.

Remove directional input/output objects from database grant fields. Use field lists or '*' per action, reject obsolete object-shaped grants, and update examples, documentation and tests. Request field directions remain supported.
