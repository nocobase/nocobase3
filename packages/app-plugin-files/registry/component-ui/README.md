# NocoBase Files Component UI

Application-owned V3 upload and preview components for a standard Scoped Files
Route. The controlled value is always `StoredFile[]`, including single-file
fields. The item preserves progress, cancel, retry, replace, preview, download,
detach, and read-only behavior.

Installing this item also materializes its `provider-ui` Registry dependency.
Import from `@/extensions/nocobase-files-component-ui`. `FileUploadField` supports
`required`, `minimum`, `maxFiles`, `maxBytes`, and `accept`. Invalid values,
active or failed uploads, and configured file constraint violations block the
nearest form submission and expose an accessible validation message.

```tsx
import { useState } from 'react';

import {
  FileUploadField,
  type StoredFile,
} from '@/extensions/nocobase-files-component-ui';

export function PurchaseOrderAttachments(): React.ReactElement {
  const [files, setFiles] = useState<StoredFile[]>([]);

  return (
    <FileUploadField
      basePath='purchase-orders/order-1/attachments'
      value={files}
      onChange={setFiles}
      multiple
      required
      minimum={1}
      maxFiles={10}
      maxBytes={50 * 1024 * 1024}
      accept={['.pdf', '.doc', '.docx', '.xls', '.xlsx']}
    />
  );
}
```

`basePath` is relative to the current App API base and must not contain `/api`,
an absolute URL, a query string, a hash, or a parent path segment. The Scoped
Files Route remains the authoritative security and upload policy boundary.
Preview and download are handled internally; application code does not build
temporary access URLs.
