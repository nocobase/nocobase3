import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import {
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileKey2,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { FileList, FileUploadField } from '../components/index.js';
import { createFilesClient } from '../files-client.js';
import type { FileAccessUrl, FileRecord, FilesClient } from '../types.js';

interface DemoProfileExample {
  readonly id: number | string;
  readonly name: string;
  readonly filesEndpoint: string;
}

interface DemoOrderExample {
  readonly id: number | string;
  readonly number: string;
  readonly filesEndpoint: string;
}

interface DemoExamples {
  readonly profile: DemoProfileExample;
  readonly order: DemoOrderExample;
}

interface ReadyDemoState {
  readonly status: 'ready';
  readonly examples: DemoExamples;
  readonly avatarClient: FilesClient;
  readonly orderClient: FilesClient;
  readonly avatarFiles: readonly FileRecord[];
  readonly orderFiles: readonly FileRecord[];
}

type DemoState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly unavailable: boolean;
    }
  | ReadyDemoState;

interface AccessState extends FileAccessUrl {
  readonly fileId: string;
  readonly status: 'ready' | 'checking' | 'valid' | 'error';
  readonly message?: string;
}

type FileSection = 'avatar' | 'order';

const AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const ORDER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'audio/*',
  'video/*',
] as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
}

function publicDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) return url;
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

function formatExpiration(value: string | null): string {
  if (!value) return 'Server default expiration';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function actionClass(variant: 'primary' | 'secondary' = 'secondary'): string {
  return variant === 'primary'
    ? 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50'
    : 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50';
}

function ErrorNotice({
  message,
}: {
  readonly message?: string;
}): ReactElement | null {
  return message ? (
    <div
      role='alert'
      className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'
    >
      {message}
    </div>
  ) : null;
}

async function loadDemoData(): Promise<ReadyDemoState> {
  const examples = await nocobaseClient.request<DemoExamples>(
    'attachments/examples',
    { method: 'GET' },
  );
  const avatarClient = createFilesClient({
    endpoint: examples.profile.filesEndpoint,
  });
  const orderClient = createFilesClient({
    endpoint: examples.order.filesEndpoint,
  });
  const [avatarFiles, orderFiles] = await Promise.all([
    avatarClient.list(),
    orderClient.list(),
  ]);
  return {
    status: 'ready',
    examples,
    avatarClient,
    orderClient,
    avatarFiles,
    orderFiles,
  };
}

function demoErrorState(error: unknown): DemoState {
  return {
    status: 'error',
    unavailable: errorStatus(error) === 503,
    message: errorMessage(error, 'Unable to load the files demo.'),
  };
}

export default function FilesDemoPage(): ReactElement {
  const [demo, setDemo] = useState<DemoState>({ status: 'loading' });
  const [avatarError, setAvatarError] = useState<string>();
  const [orderError, setOrderError] = useState<string>();
  const [accessError, setAccessError] = useState<string>();
  const [orderPublic, setOrderPublic] = useState(false);
  const [ttlSeconds, setTtlSeconds] = useState(5);
  const [access, setAccess] = useState<AccessState>();

  useEffect(() => {
    let active = true;
    void loadDemoData()
      .then((result) => {
        if (active) setDemo(result);
      })
      .catch((error: unknown) => {
        if (active) setDemo(demoErrorState(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const retryDemo = (): void => {
    setDemo({ status: 'loading' });
    setAvatarError(undefined);
    setOrderError(undefined);
    setAccessError(undefined);
    setAccess(undefined);
    void loadDemoData()
      .then(setDemo)
      .catch((error: unknown) => setDemo(demoErrorState(error)));
  };

  const privateFiles = useMemo(
    () =>
      demo.status === 'ready'
        ? demo.orderFiles.filter((file) => !file.public)
        : [],
    [demo],
  );
  const publicFiles = useMemo(
    () =>
      demo.status === 'ready'
        ? demo.orderFiles.filter((file) => file.public)
        : [],
    [demo],
  );

  const setFiles = (
    section: FileSection,
    files: readonly FileRecord[],
  ): void => {
    setDemo((current) => {
      if (current.status !== 'ready') return current;
      return section === 'avatar'
        ? { ...current, avatarFiles: files }
        : { ...current, orderFiles: files };
    });
  };

  const removeFile = async (
    section: FileSection,
    file: FileRecord,
  ): Promise<void> => {
    if (demo.status !== 'ready') return;
    const client = section === 'avatar' ? demo.avatarClient : demo.orderClient;
    const setError = section === 'avatar' ? setAvatarError : setOrderError;
    setError(undefined);
    try {
      await client.remove(file.id);
      const files = await client.list();
      setFiles(section, files);
      if (access?.fileId === file.id) setAccess(undefined);
    } catch (error) {
      setError(errorMessage(error, 'Unable to remove the file.'));
    }
  };

  const downloadFile = async (
    section: FileSection,
    file: FileRecord,
  ): Promise<void> => {
    if (demo.status !== 'ready') return;
    const client = section === 'avatar' ? demo.avatarClient : demo.orderClient;
    const setError = section === 'avatar' ? setAvatarError : setOrderError;
    setError(undefined);
    try {
      const url = file.public
        ? publicDownloadUrl(file.contentUrl)
        : (await client.createAccessUrl(file.id)).url;
      triggerDownload(url, file.filename);
    } catch (error) {
      setError(errorMessage(error, 'Unable to download the file.'));
    }
  };

  const requestPrivateAccess = async (file: FileRecord): Promise<void> => {
    if (demo.status !== 'ready') return;
    setAccessError(undefined);
    setAccess(undefined);
    try {
      const result = await demo.orderClient.createAccessUrl(
        file.id,
        ttlSeconds,
      );
      setAccess({ ...result, fileId: file.id, status: 'ready' });
    } catch (error) {
      setAccessError(
        errorMessage(error, 'Unable to create a short-lived access URL.'),
      );
    }
  };

  const checkPrivateAccess = async (): Promise<void> => {
    if (!access) return;
    setAccessError(undefined);
    setAccess({ ...access, status: 'checking', message: undefined });
    try {
      const response = await fetch(access.url, { credentials: 'include' });
      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try {
          const payload = JSON.parse(text) as {
            message?: string;
            error?: { message?: string };
          };
          detail = payload.error?.message ?? payload.message ?? text;
        } catch {
          // A plain-text server response is already safe to display.
        }
        throw new Error(
          `Access check failed (${response.status})${detail ? `: ${detail}` : '.'}`,
        );
      }
      setAccess({
        ...access,
        status: 'valid',
        message: 'The short-lived URL is still valid.',
      });
    } catch (error) {
      const message = errorMessage(error, 'Unable to check the access URL.');
      setAccess({ ...access, status: 'error', message });
    }
  };

  if (demo.status === 'loading') {
    return (
      <main className='mx-auto w-full max-w-6xl px-4 py-10 sm:px-6'>
        <div
          role='status'
          className='flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground'
        >
          <RefreshCw className='size-4 animate-spin' aria-hidden='true' />
          Loading file examples and attachments...
        </div>
      </main>
    );
  }

  if (demo.status === 'error') {
    return (
      <main className='mx-auto w-full max-w-3xl px-4 py-10 sm:px-6'>
        <section className='space-y-4 border-y py-8'>
          <h1 className='text-2xl font-semibold'>
            {demo.unavailable
              ? 'File demo is unavailable'
              : 'Unable to load the file demo'}
          </h1>
          <p role='alert' className='text-sm text-destructive'>
            {demo.message}
          </p>
          <p className='text-sm text-muted-foreground'>
            {demo.unavailable
              ? 'The application storage or database service is not available.'
              : 'The examples or attachment lists could not be loaded.'}
          </p>
          <button type='button' className={actionClass()} onClick={retryDemo}>
            <RefreshCw aria-hidden='true' />
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className='mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6'>
      <header className='space-y-4 border-b pb-8'>
        <div className='flex items-center gap-2 text-sm font-medium text-primary'>
          <HardDrive className='size-4' aria-hidden='true' />
          Plugin-owned runtime page
        </div>
        <div className='space-y-2'>
          <h1 className='text-3xl font-semibold'>Files demo</h1>
          <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
            This page demonstrates the standard file Route with real Profile and
            Order records, without requiring a Registry item.
          </p>
        </div>
        <dl className='grid gap-3 sm:grid-cols-3'>
          <div className='rounded-md border p-3'>
            <dt className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Database className='size-4' aria-hidden='true' />
              Storage and database
            </dt>
            <dd className='mt-1 flex items-center gap-2 font-medium'>
              <CheckCircle2
                className='size-4 text-emerald-600'
                aria-hidden='true'
              />
              Available
            </dd>
          </div>
          <div className='rounded-md border p-3'>
            <dt className='flex items-center gap-2 text-sm text-muted-foreground'>
              <UserRound className='size-4' aria-hidden='true' />
              Profile
            </dt>
            <dd className='mt-1 font-medium'>
              {demo.examples.profile.name} · ID {demo.examples.profile.id}
            </dd>
          </div>
          <div className='rounded-md border p-3'>
            <dt className='flex items-center gap-2 text-sm text-muted-foreground'>
              <FileKey2 className='size-4' aria-hidden='true' />
              Order
            </dt>
            <dd className='mt-1 font-medium'>{demo.examples.order.number}</dd>
          </div>
        </dl>
        <div
          className='flex flex-wrap gap-x-6 gap-y-2 text-sm'
          aria-label='File access legend'
        >
          <span>
            <strong>Public</strong> opens the content Route directly.
          </span>
          <span>
            <strong>Private</strong> requests an expiring URL before access.
          </span>
        </div>
      </header>

      <section
        aria-labelledby='avatar-heading'
        className='space-y-5 border-b pb-10'
      >
        <div className='space-y-1'>
          <h2 id='avatar-heading' className='text-xl font-semibold'>
            One-to-one Profile Avatar
          </h2>
          <p className='text-sm text-muted-foreground'>
            Private by default. Images only, with a one-file limit.
          </p>
        </div>
        <ErrorNotice message={avatarError} />
        <div data-testid='avatar-upload'>
          <FileUploadField
            client={demo.avatarClient}
            value={demo.avatarFiles}
            onChange={(files) => {
              setAvatarError(undefined);
              setFiles('avatar', files);
            }}
            onError={(error) => setAvatarError(error.message)}
            accept={AVATAR_TYPES}
            maxFiles={1}
            removeOnDelete
            labels={{ choose: 'Upload profile avatar' }}
          />
        </div>
        <FileList
          client={demo.avatarClient}
          files={demo.avatarFiles}
          emptyState='No Profile Avatar has been uploaded.'
          onDownload={(file) => void downloadFile('avatar', file)}
          onRemove={(file) => removeFile('avatar', file)}
        />
      </section>

      <section
        aria-labelledby='order-heading'
        className='space-y-5 border-b pb-10'
      >
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-1'>
            <h2 id='order-heading' className='text-xl font-semibold'>
              One-to-many Order Attachments
            </h2>
            <p className='text-sm text-muted-foreground'>
              {demo.orderFiles.length} of 10 files used for order{' '}
              {demo.examples.order.number}.
            </p>
          </div>
          <fieldset className='flex flex-wrap items-center gap-3'>
            <legend className='mb-2 text-sm font-medium'>Upload access</legend>
            <label className='flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm'>
              <input
                type='radio'
                name='order-visibility'
                checked={!orderPublic}
                onChange={() => setOrderPublic(false)}
              />
              Private
            </label>
            <label className='flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm'>
              <input
                type='radio'
                name='order-visibility'
                checked={orderPublic}
                onChange={() => setOrderPublic(true)}
              />
              Public
            </label>
          </fieldset>
        </div>
        <ErrorNotice message={orderError} />
        <div data-testid='order-upload'>
          <FileUploadField
            client={demo.orderClient}
            value={demo.orderFiles}
            onChange={(files) => {
              setOrderError(undefined);
              setFiles('order', files);
            }}
            onError={(error) => setOrderError(error.message)}
            multiple
            accept={ORDER_TYPES}
            maxFiles={10}
            public={orderPublic}
            removeOnDelete
            labels={{ choose: 'Upload order attachments' }}
          />
        </div>
        <FileList
          client={demo.orderClient}
          files={demo.orderFiles}
          emptyState='No Order Attachments have been uploaded.'
          onDownload={(file) => void downloadFile('order', file)}
          onRemove={(file) => removeFile('order', file)}
        />
      </section>

      <section aria-labelledby='access-heading' className='space-y-5 pb-6'>
        <div className='space-y-1'>
          <h2 id='access-heading' className='text-xl font-semibold'>
            Access demonstration
          </h2>
          <p className='text-sm text-muted-foreground'>
            Open a Public content Route directly, or create and test a
            short-lived Private URL. Tokens are never displayed.
          </p>
        </div>
        <ErrorNotice message={accessError} />
        <div className='grid gap-6 lg:grid-cols-2'>
          <div className='space-y-3 border-t pt-4'>
            <h3 className='font-semibold'>Public files</h3>
            {publicFiles.length ? (
              <div className='flex flex-wrap gap-2'>
                {publicFiles.map((file) => (
                  <button
                    key={file.id}
                    type='button'
                    className={actionClass()}
                    onClick={() =>
                      window.open(
                        file.contentUrl,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    <ExternalLink aria-hidden='true' />
                    Open Public file: {file.filename}
                  </button>
                ))}
              </div>
            ) : (
              <p role='status' className='text-sm text-muted-foreground'>
                No Public Order file is available.
              </p>
            )}
          </div>

          <div className='space-y-4 border-t pt-4'>
            <div className='space-y-1'>
              <h3 className='font-semibold'>Private files</h3>
              <p className='text-sm text-muted-foreground'>
                Use a very short TTL, wait for expiration, then check the URL to
                surface the server response.
              </p>
            </div>
            <label className='flex max-w-xs flex-col gap-2 text-sm font-medium'>
              Short-lived URL TTL in seconds
              <input
                type='number'
                min={1}
                max={86_400}
                value={ttlSeconds}
                className='min-h-9 rounded-md border bg-background px-3 font-normal'
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setTtlSeconds(
                    Number.isFinite(value) && value > 0 ? value : 1,
                  );
                }}
              />
            </label>
            {privateFiles.length ? (
              <div className='flex flex-wrap gap-2'>
                {privateFiles.map((file) => (
                  <button
                    key={file.id}
                    type='button'
                    className={actionClass('primary')}
                    onClick={() => void requestPrivateAccess(file)}
                  >
                    <Clock3 aria-hidden='true' />
                    Request short-lived URL: {file.filename}
                  </button>
                ))}
              </div>
            ) : (
              <p role='status' className='text-sm text-muted-foreground'>
                No Private Order file is available.
              </p>
            )}
            {access ? (
              <div className='space-y-3 rounded-md border p-3'>
                <p className='flex items-center gap-2 text-sm'>
                  <ShieldCheck className='size-4' aria-hidden='true' />
                  Expires at{' '}
                  <strong>{formatExpiration(access.expiresAt)}</strong>
                </p>
                {access.message ? (
                  <p
                    role={access.status === 'error' ? 'alert' : 'status'}
                    className='text-sm'
                  >
                    {access.message}
                  </p>
                ) : null}
                <div className='flex flex-wrap gap-2'>
                  <button
                    type='button'
                    className={actionClass()}
                    onClick={() =>
                      window.open(access.url, '_blank', 'noopener,noreferrer')
                    }
                  >
                    <ExternalLink aria-hidden='true' />
                    Open Private file
                  </button>
                  <button
                    type='button'
                    className={actionClass()}
                    disabled={access.status === 'checking'}
                    onClick={() => void checkPrivateAccess()}
                  >
                    <ShieldCheck aria-hidden='true' />
                    {access.status === 'checking'
                      ? 'Checking access...'
                      : 'Check access URL'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
