import { useEffect, useState, type ReactElement } from 'react';

import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { resolvePortalUrl } from '@nocobase/app-portal-sdk/runtime';
import { Button } from '@/components/ui/button';
import {
  FileList,
  FileUploadField,
  createFilesClient,
  type FileRecord,
  type FilesClient,
} from '@/extensions/nocobase-files-file-field-ui';

interface DemoEntity {
  readonly id: number;
  readonly name?: string;
  readonly number?: string;
  readonly filesEndpoint: string;
}

interface DemoExamples {
  readonly profile: DemoEntity;
  readonly order: DemoEntity;
}

interface ExamplesResponse {
  readonly data: DemoExamples;
}

interface FileGroupProps {
  readonly accept: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly client: FilesClient;
  readonly files: readonly FileRecord[];
  readonly multiple: boolean;
  readonly publicUpload?: boolean;
  readonly onChange: (files: readonly FileRecord[]) => void;
}

function FileGroup({
  accept,
  title,
  description,
  client,
  files,
  multiple,
  publicUpload,
  onChange,
}: FileGroupProps): ReactElement {
  return (
    <section className='space-y-4 border-t pt-6'>
      <div>
        <h2 className='text-lg font-semibold'>{title}</h2>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      <FileUploadField
        client={client}
        value={files}
        onChange={onChange}
        multiple={multiple}
        maxFiles={multiple ? 10 : 1}
        accept={accept}
        public={publicUpload}
      />
      <FileList
        client={client}
        files={files}
        onRemove={async (file) => {
          await client.remove(file.id);
          onChange(files.filter((candidate) => candidate.id !== file.id));
        }}
      />
    </section>
  );
}

export default function FilesDemoPage(): ReactElement {
  const [examples, setExamples] = useState<DemoExamples | null>(null);
  const [avatarClient, setAvatarClient] = useState<FilesClient | null>(null);
  const [orderClient, setOrderClient] = useState<FilesClient | null>(null);
  const [avatarFiles, setAvatarFiles] = useState<readonly FileRecord[]>([]);
  const [orderFiles, setOrderFiles] = useState<readonly FileRecord[]>([]);
  const [publicUpload, setPublicUpload] = useState(false);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'unavailable' | 'error'
  >('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(resolvePortalUrl('/api/attachments/examples'), {
      method: 'GET',
      headers: nocobaseClient.getHeaders({ method: 'GET' }),
      credentials: 'include',
    })
      .then(async (response): Promise<ExamplesResponse> => {
        const payload = (await response.json()) as ExamplesResponse;
        if (!response.ok) {
          throw Object.assign(
            new Error(`Unable to load file examples (${response.status}).`),
            { status: response.status },
          );
        }
        return payload;
      })
      .then(async ({ data: result }) => {
        if (!active) return;
        setExamples(result);
        const nextAvatarClient = createFilesClient({
          endpoint: result.profile.filesEndpoint,
        });
        const nextOrderClient = createFilesClient({
          endpoint: result.order.filesEndpoint,
        });
        setAvatarClient(nextAvatarClient);
        setOrderClient(nextOrderClient);
        const [avatar, order] = await Promise.all([
          nextAvatarClient.list(),
          nextOrderClient.list(),
        ]);
        if (active) {
          setAvatarFiles(avatar);
          setOrderFiles(order);
          setState('ready');
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const status =
          loadError && typeof loadError === 'object'
            ? Reflect.get(loadError, 'status')
            : undefined;
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load file examples.';
        if (status === 503) {
          setState('unavailable');
          return;
        }
        setState('error');
        setError(message);
      });
    return () => {
      active = false;
    };
  }, []);

  const issuePrivateUrl = async (): Promise<void> => {
    const file = orderFiles.find((candidate) => !candidate.public);
    if (!file || !orderClient) return;
    const result = await orderClient.createAccessUrl(file.id, 60);
    setExpiration(result.expiresAt ?? 'soon');
  };

  if (state === 'loading') {
    return (
      <div role='status' className='p-6'>
        Loading Files Demo...
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <div role='alert' className='p-6'>
        Files storage is unavailable.
      </div>
    );
  }
  if (state === 'error' || !examples || !avatarClient || !orderClient) {
    return (
      <div role='alert' className='p-6'>
        {error ?? 'Files Demo is unavailable.'}
      </div>
    );
  }

  return (
    <main className='mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10'>
      <header className='space-y-2'>
        <p className='text-sm text-muted-foreground'>
          Application-owned Files Registry page
        </p>
        <h1 className='text-3xl font-semibold'>Files Demo</h1>
        <p className='text-sm leading-6 text-muted-foreground'>
          This editable page uses the plugin's real attachments API. Public
          files can be read directly; Private files use short-lived access URLs.
        </p>
      </header>
      <div className='rounded-md border p-4 text-sm'>
        <div>
          Profile {examples.profile.id}:{' '}
          {examples.profile.name ?? 'Demo Profile'}
        </div>
        <div>
          Order {examples.order.id}: {examples.order.number ?? 'Demo Order'}
        </div>
        <div className='mt-2 flex gap-3'>
          <span>Public</span>
          <span>Private</span>
        </div>
      </div>
      <FileGroup
        accept={['image/*']}
        title='Profile Avatar'
        description='A controlled one-file field backed by the Demo profile endpoint.'
        client={avatarClient}
        files={avatarFiles}
        multiple={false}
        onChange={setAvatarFiles}
      />
      <section className='space-y-4 border-t pt-6'>
        <div>
          <h2 className='text-lg font-semibold'>Order Attachments</h2>
          <p className='text-sm text-muted-foreground'>
            Up to ten files. Choose whether each upload is Public or Private.
          </p>
        </div>
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={publicUpload}
            onChange={(event) => setPublicUpload(event.target.checked)}
          />
          Upload as Public
        </label>
        <FileGroup
          accept={[
            'image/*',
            'application/pdf',
            'text/*',
            'application/json',
            'audio/*',
            'video/*',
          ]}
          title='Order Attachments'
          description='Public and Private records share the same endpoint.'
          client={orderClient}
          files={orderFiles}
          multiple
          publicUpload={publicUpload}
          onChange={setOrderFiles}
        />
      </section>
      <section className='space-y-3 border-t pt-6'>
        <div>
          <h2 className='text-lg font-semibold'>Private access</h2>
          <p className='text-sm text-muted-foreground'>
            Request a 60-second access URL without exposing its token.
          </p>
        </div>
        <Button type='button' onClick={() => void issuePrivateUrl()}>
          Request Private URL
        </Button>
        {expiration ? (
          <p className='text-sm' role='status'>
            Private URL expires at {expiration}.
          </p>
        ) : null}
      </section>
    </main>
  );
}
