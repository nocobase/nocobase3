# NocoBase File Upload

Editable shadcn components backed only by `@nocobase/portal-sdk/files` and the Files Kernel `files/v1` API. The controlled value is `FileObject[]`; applications persist only each object's stable `id` (`fileId`) in their own data model.

```tsx
<FileUpload policy="attachment" value={files} onChange={setFiles} multiple maxFiles={5} accept={["image/*", "application/pdf"]} />
```

The default policy comes from `files.getConfig()`. Client limits can only be stricter than the server policy. Upload uses one `files.upload()` call per file, with an idempotency key reused by the retry path and an `AbortController` per item. No signed URL or temporary URL is placed in `value` or persisted state.

Removing a value only calls `onChange` by default. `deleteOnRemove` is opt-in and calls `files.remove` only after the app explicitly chooses destructive cleanup; removal failures leave the value unchanged. The preview component requests short-lived inline URLs in memory and never renders active HTML, XML, or SVG inline.

This Registry item is copied into `client/extensions/nocobase-file-upload/` and belongs to the installing App. It does not persist business records or implement folders, business linking, provider APIs, chunked transport, or a file manager.
