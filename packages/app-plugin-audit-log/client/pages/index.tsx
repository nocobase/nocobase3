import { createAppClient } from '@nocobase/app-sdk';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { useAuditLog } from '../contexts.js';

interface AuditLogResponse {
  readonly message: string;
  readonly plugin: string;
}

interface StatusCardProps {
  readonly detail: string;
  readonly label: string;
  readonly tone?: 'default' | 'success';
  readonly value: string;
}

const appClient = createAppClient();

function requestPlugin(signal?: AbortSignal): Promise<AuditLogResponse> {
  return appClient.request<AuditLogResponse>('audit-log', { signal });
}

function StatusCard({
  detail,
  label,
  tone = 'default',
  value,
}: StatusCardProps): ReactElement {
  return (
    <article className='rounded-xl border bg-card p-4 shadow-sm'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <span
          className={`size-2 rounded-full ${tone === 'success' ? 'bg-emerald-500' : 'bg-primary'}`}
        />
      </div>
      <p className='mt-3 text-xl font-semibold tracking-tight'>{value}</p>
      <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
    </article>
  );
}

function CodeValue({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <code className='rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground'>
      {children}
    </code>
  );
}

export default function AuditLogPage(): ReactElement {
  const { welcomeMessage } = useAuditLog();
  const [result, setResult] = useState<AuditLogResponse>();
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
    <main className='min-h-full bg-muted/20 px-4 py-6 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <header className='overflow-hidden rounded-2xl border bg-card shadow-sm'>
          <div className='bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-6 sm:p-8'>
            <div className='flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between'>
              <div className='max-w-2xl'>
                <div className='mb-4 flex items-center gap-3'>
                  <span className='grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm'>
                    {'Audit Log App Plugin'.slice(0, 1)}
                  </span>
                  <span className='rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300'>
                    Plugin active
                  </span>
                </div>
                <p className='text-sm font-medium text-primary'>App plugin</p>
                <h1 className='mt-1 text-3xl font-semibold tracking-tight'>
                  {'Audit Log App Plugin'}
                </h1>
                <p className='mt-3 max-w-xl leading-7 text-muted-foreground'>
                  {welcomeMessage}. This starter dashboard verifies that the
                  client provider, route, and server API are connected.
                </p>
              </div>
              <button
                type='button'
                onClick={refreshResult}
                disabled={isLoading}
                className='inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {isLoading ? 'Checking…' : 'Refresh status'}
              </button>
            </div>
          </div>
        </header>

        <section className='grid gap-4 sm:grid-cols-3'>
          <StatusCard
            label='Client provider'
            value='Ready'
            detail='Context is available to this route'
            tone='success'
          />
          <StatusCard
            label='Server connection'
            value={
              error ? 'Needs attention' : isLoading ? 'Checking' : 'Online'
            }
            detail={
              error
                ? 'Review the response below'
                : 'API route responded successfully'
            }
            tone={error ? 'default' : 'success'}
          />
          <StatusCard
            label='Route'
            value={'/audit-log'}
            detail='Lazy-loaded client contribution'
          />
        </section>

        <section className='grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]'>
          <article className='overflow-hidden rounded-2xl border bg-card shadow-sm'>
            <div className='flex items-center justify-between border-b px-5 py-4 sm:px-6'>
              <div>
                <h2 className='font-semibold'>Server API response</h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Live data from the plugin route
                </p>
              </div>
              <span className='font-mono text-xs text-muted-foreground'>
                GET /api/audit-log
              </span>
            </div>
            <div className='p-5 sm:p-6'>
              {isLoading ? (
                <div className='space-y-3' aria-label='Loading server data'>
                  <div className='h-4 w-28 animate-pulse rounded bg-muted' />
                  <div className='h-12 animate-pulse rounded-lg bg-muted' />
                  <div className='h-12 animate-pulse rounded-lg bg-muted' />
                </div>
              ) : error ? (
                <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4'>
                  <p className='font-medium text-destructive'>Request failed</p>
                  <p className='mt-1 text-sm text-muted-foreground'>{error}</p>
                  <button
                    type='button'
                    onClick={refreshResult}
                    className='mt-4 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted'
                  >
                    Retry request
                  </button>
                </div>
              ) : (
                <dl className='grid gap-4'>
                  <div className='rounded-xl border bg-muted/20 p-4'>
                    <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                      Plugin package
                    </dt>
                    <dd className='mt-2 break-all font-mono text-sm'>
                      {result?.plugin}
                    </dd>
                  </div>
                  <div className='rounded-xl border bg-muted/20 p-4'>
                    <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                      Message
                    </dt>
                    <dd className='mt-2 text-sm leading-6'>
                      {result?.message}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </article>

          <aside className='rounded-2xl border bg-card p-5 shadow-sm sm:p-6'>
            <p className='text-sm font-medium text-primary'>Next steps</p>
            <h2 className='mt-1 text-xl font-semibold tracking-tight'>
              Make this plugin yours
            </h2>
            <p className='mt-2 text-sm leading-6 text-muted-foreground'>
              The scaffold keeps each contribution explicit and independently
              replaceable.
            </p>
            <ol className='mt-5 space-y-4 text-sm'>
              <li className='flex gap-3'>
                <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>
                  1
                </span>
                <span>
                  Replace this dashboard in{' '}
                  <CodeValue>client/pages/index.tsx</CodeValue>
                </span>
              </li>
              <li className='flex gap-3'>
                <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>
                  2
                </span>
                <span>
                  Implement the API in{' '}
                  <CodeValue>server/routes/index.ts</CodeValue>
                </span>
              </li>
              <li className='flex gap-3'>
                <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>
                  3
                </span>
                <span>Adjust defaults on the plugin settings page</span>
              </li>
            </ol>
          </aside>
        </section>
      </div>
    </main>
  );
}
