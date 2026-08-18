# NocoBase Attachment Field

`AttachmentField` is a controlled example for business tables: its public value and `onChange` are `fileId[]`, in stable order. It hydrates metadata with `files.get()`, composes the editable `file-upload` and `file-preview` items, and never emits temporary URLs or relation records. Missing files remain as unavailable entries instead of dropping other IDs.

`deleteFileOnRemove` defaults to `false`; enable it only with an explicit destructive-cleanup warning. Your App owns the relation/table and must authorize upload, read, and deletion on the server.

Refine React Hook Form usage:

```tsx
<Controller name="attachmentFileIds" control={form.control} render={({ field }) => <AttachmentField value={field.value ?? []} onChange={field.onChange} policy="attachment" context={{ resource: "tasks", resourceId: taskId, field: "attachments" }} />} />
```
