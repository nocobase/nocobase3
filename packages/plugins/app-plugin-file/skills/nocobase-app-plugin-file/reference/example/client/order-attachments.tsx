import {
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import {
  createFilesClient,
  FilePreviewField,
  FileUploadField,
  type FileRecord,
  type FileUploadStatus,
} from '@nocobase/app-plugin-file/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

export interface OrderAttachmentsProps {
  readonly orderId?: string;
  readonly onDone: () => void;
}

export default function OrderAttachments(
  props: OrderAttachmentsProps,
): ReactElement {
  const api = useService(apiClientToken);
  if (!props.orderId) return <p>Save the order before adding attachments.</p>;
  // The key belongs on the component owning ALL state, not just the upload field.
  return (
    <SavedOrderAttachments
      key={props.orderId}
      api={api}
      orderId={props.orderId}
      onDone={props.onDone}
    />
  );
}

function SavedOrderAttachments({
  api,
  orderId,
  onDone,
}: {
  readonly api: ApiClient;
  readonly orderId: string;
  readonly onDone: () => void;
}): ReactElement {
  const client = useMemo(
    () =>
      createFilesClient({
        api,
        endpoint: `purchase-orders/${encodeURIComponent(orderId)}/attachments`,
      }),
    [api, orderId],
  );
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<FileUploadStatus>('idle');

  useEffect(() => {
    let active = true;
    void client
      .list()
      .then((records) => {
        if (!active) return;
        setFiles(records);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load attachments.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [client, attempt]);

  const ready = loaded && status === 'idle';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onDone();
      }}
    >
      <p>
        Uploads and deletions are saved immediately. Closing this form does not
        undo them.
      </p>
      {!loaded && !loadError ? (
        <p role='status'>Loading attachments...</p>
      ) : null}
      {loadError ? (
        <div role='alert'>
          {loadError}
          <button
            type='button'
            onClick={() => {
              setLoadError(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            Retry loading
          </button>
        </div>
      ) : null}
      {operationError ? <p role='alert'>{operationError}</p> : null}
      <FileUploadField
        client={client}
        value={files}
        onChange={(records) => {
          setFiles(records);
          setOperationError(undefined);
        }}
        onError={(error) => setOperationError(error.message)}
        onStatusChange={setStatus}
        multiple
        accept={['application/pdf']}
        maxSize={50 * 1024 * 1024}
        maxFiles={10}
        disabled={!loaded}
        removeOnDelete
      />
      <FilePreviewField
        client={client}
        files={files}
        onError={(error) => setOperationError(error.message)}
      />
      <button type='submit' disabled={!ready}>
        Done
      </button>
    </form>
  );
}
