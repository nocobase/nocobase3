import { useTranslation as useDemoTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Button } from '../components/ui/button.js';
import { useRoutesExample } from '../contexts/routes-example-context.js';

interface RoutesExampleResponse {
  message: string;
  plugin: string;
  scope: 'api';
}

export default function RoutesExamplePage(): ReactElement {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-routes-example',
  );

  // The Application's own API client, so the route follows whatever `api.baseURL` the Application is configured with.
  const api = useService(apiClientToken);
  const { description } = useRoutesExample();
  const [result, setResult] = useState<RoutesExampleResponse>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const loadResult = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await api.request<RoutesExampleResponse>({
        path: 'routes-example',
      });
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
  }, [api]);

  useEffect(() => {
    let active = true;

    void api
      .request<RoutesExampleResponse>({ path: 'routes-example' })
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
  }, [api]);

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>
          {translateDemo('Client route example', {
            defaultValue: 'Client route example',
          })}
        </p>
        <h1 className='text-2xl font-semibold'>
          {translateDemo('Routes example', { defaultValue: 'Routes example' })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {translateDemo(description, { defaultValue: description })}{' '}
          {translateDemo(
            "It was lazy-loaded and reads a response from the same plugin's server route.",
            {
              defaultValue:
                "It was lazy-loaded and reads a response from the same plugin's server route.",
            },
          )}
        </p>
      </header>

      <section className='flex-1 py-10'>
        {isLoading ? (
          <p className='text-sm text-muted-foreground'>
            {translateDemo('Loading server data…', {
              defaultValue: 'Loading server data…',
            })}
          </p>
        ) : error ? (
          <div className='space-y-4'>
            <p className='text-sm text-red-600'>
              {translateDemo(error, { defaultValue: error })}
            </p>
            <Button variant='outline' onClick={() => void loadResult()}>
              {translateDemo('Retry request', {
                defaultValue: 'Retry request',
              })}
            </Button>
          </div>
        ) : (
          <dl className='space-y-4 rounded-xl border p-6'>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {translateDemo('Plugin', { defaultValue: 'Plugin' })}
              </dt>
              <dd className='font-medium'>{result?.plugin}</dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {translateDemo('Scope', { defaultValue: 'Scope' })}
              </dt>
              <dd className='font-medium'>{result?.scope}</dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {translateDemo('Message', { defaultValue: 'Message' })}
              </dt>
              <dd className='font-medium'>{result?.message}</dd>
            </div>
          </dl>
        )}
      </section>
    </section>
  );
}
