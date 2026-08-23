import { appClientPluginLoaders } from 'virtual:nocobase-app-client-plugins';
import { AppClientRoot } from '@nocobase/app-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createApp } from './app';
import { createAppRuntime } from './runtime';
import { AppStartupError } from './startup';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing application root element.');
}

const root = createRoot(container);

async function start(): Promise<void> {
  try {
    const runtime = await createAppRuntime({
      plugins: appClientPluginLoaders,
    });
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
