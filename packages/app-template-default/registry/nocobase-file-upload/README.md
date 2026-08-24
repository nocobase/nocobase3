# NocoBase File Upload

V3 controlled upload and preview fields for a standard Scoped Files Route.
The Registry uses the current App `nocobaseClient` internally and keeps
`StoredFile[]` as the only field value shape, including single-file fields.

`basePath` is relative to the current App API base and must not contain `/api`,
an absolute URL, a query string, a hash, or a parent path segment.

```tsx
import type { StoredFile } from '@nocobase/app-plugin-files/client';
import { nocobaseClient } from '@nocobase/portal-sdk/client';
import { useEffect, useState } from 'react';

import {
  FilePreviewField,
  FileUploadField,
} from '@/extensions/nocobase-file-upload';

export function PurchaseOrderAttachments({
  orderId,
  readOnly,
}: {
  orderId: string;
  readOnly: boolean;
}) {
  const basePath = `purchase-orders/${encodeURIComponent(orderId)}/attachments`;
  const [files, setFiles] = useState<StoredFile[]>([]);

  useEffect(() => {
    void nocobaseClient.request<StoredFile[]>(basePath).then(setFiles);
  }, [basePath]);

  if (readOnly) {
    return <FilePreviewField basePath={basePath} value={files} showFileName />;
  }

  return (
    <FileUploadField
      basePath={basePath}
      value={files}
      onChange={setFiles}
      multiple
      maxFiles={10}
      maxBytes={50 * 1024 * 1024}
      accept={['.pdf', '.doc', '.docx', '.xls', '.xlsx']}
    />
  );
}
```

The component calls the Scoped Files lifecycle directly:

```text
POST   {basePath}
PUT    Upload Plan upload URL
POST   Upload Plan complete URL
DELETE Upload Plan cancel URL
GET    {basePath}/:fileId/content
HEAD   {basePath}/:fileId/content
DELETE {basePath}/:fileId
```

Selecting a new file in single-file mode automatically sends the existing
file ID as `replaceFileId`. In multiple mode, use the replace action on an
existing item. The old file remains visible until the new upload completes.
Failed retries create a fresh upload plan and therefore a fresh file ID.

Images, PDF, text, Markdown, audio, and video have inline previewers. Office
documents and unsupported or active-content formats are download-only in V1.
Client-side `maxFiles`, `maxBytes`, and `accept` checks improve feedback; the
Scoped Files Route remains the authoritative security boundary.
