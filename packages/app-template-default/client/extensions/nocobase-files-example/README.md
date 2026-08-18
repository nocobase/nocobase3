# NocoBase Files Examples

This small editable demo composes the three Files Registry items. It demonstrates an avatar (`users.avatar_file_id`), record attachments (`task_attachments` with `task_id`, `file_id`, `sort`, and `description`), and a document library (`documents`, `folders`, and `document_versions`). These are App-owned models; the Files Kernel stores file metadata and stable IDs only.

The demo uses local React state, so it runs without a business backend. Replace the marked save boundary with your App data API. Persist `fileId`/`fileId[]`, never a temporary URL. Uploading a replacement avatar does not delete the old file before the business save succeeds. Relation removal and document cleanup are separate App policies.

AI editing guide: narrow `accept` and `maxSize` at the component call site, pass the business `context` for server authorization, use `FilePreview` for open/download, and keep all delete operations explicit. Do not add folders, tags, versions, or a fixed file manager to the Kernel. Server authorization remains authoritative.
