import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { StrictMode } from 'react';

import { createApp } from './app';
import appRuntime from './runtime';
import { AppStartupError } from './startup';
import './styles.css';

async function start(): Promise<void> {
  try {
    const runtime = await resolveAppRuntime(appRuntime);
    const app = createApp(runtime);
    await app.start();
    app.mount('#root');
  } catch (error) {
    const container = document.getElementById('root');
    if (!container) {
      throw new Error('Missing application root element.', { cause: error });
    }
    const { createRoot } = await import('react-dom/client');
    createRoot(container).render(
      <StrictMode>
        <AppStartupError error={error} />
      </StrictMode>,
    );
  }
}

void start();
