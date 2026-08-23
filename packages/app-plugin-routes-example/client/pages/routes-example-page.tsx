import { Button } from '@nocobase/app-client/ui';
import { createAppClient } from '@nocobase/app-sdk';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { useRoutesExample } from '../contexts/routes-example-context.js';

interface RoutesExampleResponse {
  message: string;
  plugin: string;
}

const appClient = createAppClient();

export default function RoutesExamplePage(): ReactElement {
  const { description } = useRoutesExample();
  const [result, setResult] = useState<RoutesExampleResponse>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const loadResult = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(undefined);
    try {
      const response =
        await appClient.request<RoutesExampleResponse>('routes-example');
      setResult(response);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load the server route.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void appClient
      .request<RoutesExampleResponse>('routes-example')
      .then((response) => {
        if (active) {
          setResult(response);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the server route.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-3xl flex-col px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>Client route example</p>
        <h1 className='text-2xl font-semibold'>Routes example</h1>
        <p className='text-sm text-muted-foreground'>
          {description} It was lazy-loaded and reads a response from the same
          plugin's server route.
        </p>
      </header>

      <section className='flex-1 py-10'>
        {isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading server data…</p>
        ) : error ? (
          <div className='space-y-4'>
            <p className='text-sm text-red-600'>{error}</p>
            <Button variant='outline' onClick={() => void loadResult()}>
              Retry request
            </Button>
          </div>
        ) : (
          <dl className='space-y-4 rounded-xl border p-6'>
            <div>
              <dt className='text-sm text-muted-foreground'>Plugin</dt>
              <dd className='font-medium'>{result?.plugin}</dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>Message</dt>
              <dd className='font-medium'>{result?.message}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
