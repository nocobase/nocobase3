import { AppClientRoot } from '@nocobase/app-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import application from './application';
import { createApp } from './app';
import clientModules from './modules';
import routeComponentOverrides from './route-overrides';
import { createAppRuntime } from './runtime';
import sourceExtensions from './source-extensions';
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
      application,
      plugins: clientModules.plugins,
      routeComponentOverrides: [
        ...clientModules.routeComponentOverrides,
        ...routeComponentOverrides,
      ],
      sourceExtensions,
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
