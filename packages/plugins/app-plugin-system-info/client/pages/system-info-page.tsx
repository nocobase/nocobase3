import { createAppClient } from '@nocobase/app-sdk';
import { useEffect, useState, type ReactElement } from 'react';

interface SystemInfoResponse {
  readonly packageName: string;
  readonly version: string;
  readonly nodeVersion: string;
  readonly serverTime: string;
}

const appClient = createAppClient();

function requestPlugin(signal?: AbortSignal): Promise<SystemInfoResponse> {
  return appClient.request<SystemInfoResponse>('system-info', { signal });
}

export default function SystemInfoPage(): ReactElement {
  const [result, setResult] = useState<SystemInfoResponse>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshResult = (): void => {
    setIsLoading(true);
    setError(undefined);
    void requestPlugin()
      .then(setResult)
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the server route.',
        );
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    void requestPlugin(controller.signal)
      .then((response) => {
        setResult(response);
        setError(undefined);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the server route.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main className='mx-auto max-w-3xl space-y-6 px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>NocoBase v3 plugin</p>
        <h1 className='text-2xl font-semibold'>System information</h1>
        <p className='text-sm text-muted-foreground'>
          A live, read-only response from the plugin Server API.
        </p>
      </header>
      <button
        type='button'
        onClick={refreshResult}
        disabled={isLoading}
        className='rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
      >
        {isLoading ? 'Loading…' : 'Refresh'}
      </button>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      {result ? (
        <dl className='grid gap-4 rounded-xl border p-6'>
          <div>
            <dt className='text-sm text-muted-foreground'>Package</dt>
            <dd className='font-mono text-sm'>{result.packageName}</dd>
          </div>
          <div>
            <dt className='text-sm text-muted-foreground'>Version</dt>
            <dd>{result.version}</dd>
          </div>
          <div>
            <dt className='text-sm text-muted-foreground'>Node</dt>
            <dd>{result.nodeVersion}</dd>
          </div>
          <div>
            <dt className='text-sm text-muted-foreground'>Server time</dt>
            <dd>{result.serverTime}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
