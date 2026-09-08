---
name: nocobase-app-plugin-file-repository-example
description: Run the attachments upload demonstration built on the File Repository core plugin.
---

# Run the File Repository example

Use this example to inspect a working collection, file API, and upload page.
For custom business integration, use the core plugin's Skill instead.

Register `@nocobase/app-plugin-file-repository` before this example in both the
Client and Server plugin lists. Use each package's public `./client` factory
and `./server` definition. Peer dependencies do not register providers for you.
Run the App migration command to create `attachments`; the example owns that
migration, while the core plugin creates no collection.

Visit `/dev/file-repository` in a development build after signing into the App.
The example uses the core Client manager token, the `attachments` resource,
connection `main`, disk `local`, and accessPath `/uploads/attachments`.
Choose one file and upload it, or select multiple files for uploadMany.
Verify the returned record appears and its download matches the original bytes.
The displayed contentUrl already includes the host public base path.

The Server exposes findMany/findOne/count/exists/deleteOne/uploadOne/uploadMany
as POST `/api/attachments:<action>` and streams full files from the root path
`/uploads/attachments/<uuid>.<ext>`. The example API remains enabled outside
development builds even though the page does not. Do not redeclare its routes.

Route authentication and authorization are intentionally deferred in this first
version. Deleting a record retains its storage object. Range/206 and conditional
requests are not implemented. Default upload body limits are 5 MiB for one file
and 20 MiB for a batch, including multipart overhead.

Applications may use only the core plugin and provide their own collection,
routes and pages; this example is optional and does not own the core services.
