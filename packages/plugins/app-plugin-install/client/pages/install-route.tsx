import { useEffect, useState, type ReactElement } from 'react';

import { resolveAppUrl } from '@nocobase/app-client';

import { Button } from '../components/ui/button.js';
import InstallPage from './install-page.js';
import { resolveInstalledDestination } from './install-navigation.js';

interface InstallStatusResponse {
  readonly installed?: boolean;
}

type InstallStatus = 'checking' | 'not-installed' | 'error';

const STATUS_RETRY_DELAY_MS = 250;

export default function InstallRoute(): ReactElement {
  const [status, setStatus] = useState<InstallStatus>('checking');
  const [configurationSaved, setConfigurationSaved] = useState(false);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const checkStatus = async (): Promise<void> => {
      try {
        const response = await fetch(resolveAppUrl('/install/status'), {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Unable to check the installation status.');
        }

        const result = (await response.json()) as InstallStatusResponse;
        if (!active) return;

        if (result.installed === true) {
          window.location.replace(
            resolveAppUrl(resolveInstalledDestination(configurationSaved)),
          );
          return;
        }

        setStatus('not-installed');
        if (configurationSaved) {
          retryTimer = setTimeout(() => {
            void checkStatus();
          }, STATUS_RETRY_DELAY_MS);
        }
      } catch {
        if (!active) return;

        if (configurationSaved) {
          retryTimer = setTimeout(() => {
            void checkStatus();
          }, STATUS_RETRY_DELAY_MS);
          return;
        }

        setStatus('error');
      }
    };

    void checkStatus();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [configurationSaved]);

  if (status === 'error') {
    return (
      <main className='grid min-h-svh place-items-center bg-background px-6 py-12'>
        <section className='w-full max-w-lg space-y-5 rounded-2xl border bg-card p-8 text-card-foreground shadow-sm'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Unable to check installation status
          </h1>
          <p className='leading-7 text-muted-foreground'>
            Make sure the application server is running, then try again.
          </p>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </section>
      </main>
    );
  }

  if (status === 'checking') {
    return (
      <main className='grid min-h-svh place-items-center bg-background px-6 py-12'>
        <p className='text-sm text-muted-foreground'>
          Checking installation status…
        </p>
      </main>
    );
  }

  return <InstallPage onConfigured={() => setConfigurationSaved(true)} />;
}
