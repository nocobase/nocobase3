import { AppClientRoot, type ClientApplication } from '@nocobase/app-client';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
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
let app: ClientApplication | undefined;
let applicationStarted = false;

async function start(): Promise<void> {
  try {
    const runtime = await resolveAppRuntime(appRuntime);

    app = createApp(runtime);
    await app.start();
    applicationStarted = true;

    root.render(<AppClientRoot app={app} />);
  } catch (startupError) {
    let error: unknown = startupError;

    if (app && applicationStarted) {
      try {
        await app.shutdown();
      } catch (shutdownError) {
        error = new AggregateError(
          [startupError, shutdownError],
          'Client Application startup and shutdown both failed.',
          { cause: startupError },
        );
      }
    }

    root.render(<AppStartupError error={error} />);
  }
}

void start();
