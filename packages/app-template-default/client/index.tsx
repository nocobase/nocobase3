import { AppClientRoot } from '@nocobase/app-client';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createApp } from './app';
import appRuntime from './runtime';
import { AppStartupError } from './startup';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing application root element.');
}

const root = createRoot(container);

async function start(): Promise<void> {
  try {
    const runtime = await resolveAppRuntime(appRuntime);
    const app = createApp(runtime);

    root.render(
      <StrictMode>
        <AppClientRoot config={app} />
      </StrictMode>,
    );
  } catch (error) {
    root.render(
      <StrictMode>
        <AppStartupError error={error} />
      </StrictMode>,
    );
  }
}

void start();
