import { FileUploadField } from '@nocobase/app-plugin-file/client/components';
import { createFilesClient } from '@nocobase/app-plugin-file/client/files-client';
import type {
  FileRecord,
  FileUploadStatus,
} from '@nocobase/app-plugin-file/client/types';
import { useMemo, type ReactElement } from 'react';

export interface PurchaseOrderAttachmentsProps {
  readonly orderId: number;
  readonly value: readonly FileRecord[];
  readonly onChange: (value: readonly FileRecord[]) => void;
  readonly onStatusChange: (status: FileUploadStatus) => void;
}

export function PurchaseOrderAttachments({
  orderId,
  value,
  onChange,
  onStatusChange,
}: PurchaseOrderAttachmentsProps): ReactElement {
  const client = useMemo(
    () =>
      createFilesClient({
        endpoint: `/api/purchase-orders/${orderId}/attachments`,
      }),
    [orderId],
  );

  return (
    <FileUploadField
      client={client}
      value={value}
      onChange={onChange}
      onStatusChange={onStatusChange}
      multiple
      accept={['application/pdf']}
      maxSize={50 * 1024 * 1024}
      maxFiles={10}
    />
  );
}
