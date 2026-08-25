import { appClientPluginLoaders } from 'virtual:nocobase-app-client-plugins';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import application from './application.js';
import { routeOverrides } from './route-overrides.js';
import { createServiceDeskClientRuntime } from './runtime.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing application root element.');
const root = createRoot(container);
void createServiceDeskClientRuntime(
  application,
  appClientPluginLoaders,
  routeOverrides,
).then(
  (runtime) =>
    root.render(
      <StrictMode>
        <App runtime={runtime} />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <main className='full-state'>
        <h1>服务台 App 启动失败</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </main>,
    ),
);
