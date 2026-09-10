---
name: nocobase-app-plugin-file-example
description: Run the NocoBase 3 attachments example supplied by app-plugin-file-example, inspect its upload/list/download page, and use it as a reference for the core app-plugin-file services. Not a secure private-file blueprint.
---

# Run the attachments example

The example owns the attachments migration, resource routes, and /dev/file-repository page. The core @nocobase/app-plugin-file owns Repository services and Registry UI. Read its nocobase-app-plugin-file Skill for a new business collection or editable file field.

Register the core first, then this example, on both Client and Server. Use the full @nocobase/app-plugin-file-example package name with plugin register/inspect/unregister commands. Run the App's migrations; the example expects an existing main connection and local Drive disk. The Examples template already registers both. Default registers only the core.

Open /dev/file-repository in development. Upload one file, upload a batch, refresh the list, open each returned contentUrl, and delete a metadata record. Verify downloaded bytes match the input and batch results contain the expected files. HTTP resource actions are POST /api/attachments:action; content is GET /uploads/attachments/uuid.ext. Host prefixes are already in contentUrl.

Do not create another attachments migration or duplicate routes while the example is enabled. The migration's name and contents remain unchanged across the rename, so an already applied copy is skipped.

The Server endpoints are public even though the page is development-only. A private disk does not protect them. deleteOne only deletes metadata, not the stored object. For restricted business files, use the core Skill's access-policy guidance and test both API and content authorization. The example does not implement Range, conditional downloads, or physical cleanup.
