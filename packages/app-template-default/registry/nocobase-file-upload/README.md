# NocoBase File Upload

Controlled shadcn/ui file upload and preview fields for NocoBase file-template
collections.

Installations using the Starter's extension host also get a development-only
file manager at `/dev/files`. Its preview gallery uses public remote URLs and
does not require `attachments:list`; successful uploads to NocoBase's built-in
`attachments` collection are appended to the gallery for the current session.

This registry item is generic. Do not hard-code `users.avatar`, `users.files`,
or the built-in `attachments` collection in generated business pages. A page
should only use the component after it has confirmed that the business field is
a relation to a file-template collection.

## Descriptor

Read collection metadata with `collections:listMeta` or `collections:get`, find
the relation field on the business collection, and build the descriptor from the
field metadata:

```ts
import type { FileFieldDescriptor } from "@/extensions/nocobase-file-upload";

export const contractDocumentsDescriptor = {
  sourceCollection: "contracts",
  fieldName: "documents",
  fileCollection: "contractFiles",
  dataSourceKey: "main",
  relation: "belongsToMany",
  accept: ["application/pdf", ".docx", ".xlsx"],
} satisfies FileFieldDescriptor;
```

The important fields are:

- `sourceCollection`: the business collection that owns the relation field.
- `fieldName`: the relation field name on the business collection.
- `fileCollection`: the relation field's `target`; this must be a file-template collection.
- `relation`: the relation field's type. `belongsTo` and `hasOne` are single-file fields; `belongsToMany`, `hasMany`, and `belongsToArray` are multi-file fields.
- `dataSourceKey`: set this when the field belongs to a non-main data source.

## Upload strategy

`FileUploadField` uses `uploadMode="auto"` by default. Auto mode honors the
`clientUpload` capability when `storages:check` provides it and falls back to
the current `s3-compatible` direct-upload behavior. Set `uploadMode` to
`"direct"` or `"multipart"` when an installation needs an explicit choice.

For demos, tests, or a custom storage adapter, pass `uploadFile`. The handler
receives the selected file, descriptor, and abort signal and returns a complete
file record. When this prop is present, the field does not call NocoBase storage
APIs:

```tsx
<FileUploadField
  descriptor={contractDocumentsDescriptor}
  value={value}
  onChange={setValue}
  uploadFile={async ({ file, signal }) => {
    const record = await customUpload(file, { signal });
    return record;
  }}
/>
```

## Editing

Keep the full uploaded file record in form state. Serialize file fields only
when submitting to NocoBase:

```tsx
import {
  FileUploadField,
  serializeFileFieldValues,
} from "@/extensions/nocobase-file-upload";

const fileDescriptors = [contractDocumentsDescriptor];

<FileUploadField
  descriptor={contractDocumentsDescriptor}
  value={field.value ?? []}
  onChange={field.onChange}
  messages={{
    chooseFiles: "Choose files",
    noFiles: "No files",
  }}
  previewMessages={{
    preview: "Preview",
    download: "Download",
  }}
/>;

const payload = serializeFileFieldValues(values, fileDescriptors);
// payload.documents is [{ id }, ...] because documents is belongsToMany.
```

Set `showRemoveTooltip={false}` when an icon-only remove action should retain
its accessible label without displaying a visual tooltip.

When rendered inside this Starter's `FormField`, the upload field registers its
validation controller automatically. React Hook Form checks that controller
during normal field validation, so submitting while a file is pending,
checking storage, uploading, or waiting for a failed upload to be retried or
removed is rejected without form-level upload callbacks or additional rules.

Add file relation fields to `meta.appends` when loading records for edit pages,
so the form receives full file records instead of only relation ids:

```ts
import { getFileFieldAppends } from "@/extensions/nocobase-file-upload";

const meta = {
  appends: getFileFieldAppends(fileDescriptors),
};
```

## Preview

Readonly pages can render the same file value with `FilePreviewField`:

```tsx
import { FilePreviewField } from "@/extensions/nocobase-file-upload";

<FilePreviewField
  value={record?.documents ?? []}
  descriptor={contractDocumentsDescriptor}
  size={80}
  showFileName
  messages={{
    preview: "Preview",
    download: "Download",
    noFiles: "No files",
  }}
/>;
```

Preview support includes images, PDF through the browser, text/JSON, audio,
video, GitHub-flavored Markdown through `react-markdown`, Office documents
through Microsoft Office Online, and a download fallback for unsupported or
active-content files such as HTML, XML, and SVG. Private
Office files require `descriptor` so the component can request a temporary URL;
the temporary URL still has to be reachable by the Office Online service.
Preview and download flags are added only to relative or same-origin NocoBase
file URLs. Original third-party and pre-signed URLs are used without mutation.

The preview value does not have to come from a file API. Public URLs can be used
for demos and prototypes by creating records with stable mock ids and enough
metadata for preview type detection:

```ts
const mockFiles = [
  {
    id: "mock-photo",
    title: "Workspace photo",
    filename: "workspace.jpg",
    extname: ".jpg",
    mimetype: "image/jpeg",
    url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
  },
];
```

Do not submit mock ids to a NocoBase relation field. Keep mock records in the
example or preview layer and replace them with uploaded file records before
serializing a real form.
