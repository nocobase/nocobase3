import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createHubRuntimeEnvironment,
  formatHubLocalEnvironment,
} from '../src/lib/hub-runtime.ts';

describe('createHubRuntimeEnvironment', () => {
  it('keeps the Hub server and App Host on distinct ports', () => {
    const directory = path.resolve('/tmp/example-hub');
    const environment = createHubRuntimeEnvironment(
      {
        host: '127.0.0.1',
        name: 'example',
        port: 13_000,
      },
      directory,
      { PATH: '/bin' },
    );

    expect(environment).toMatchObject({
      APP_BASE_PATH: '/hub',
      APP_SERVER_HOST: '127.0.0.1',
      APP_SERVER_PORT: '13000',
      APP_HOST_BIND: '127.0.0.1',
      APP_HOST_PORT: '3000',
      AUTH_BASE_URL: 'http://127.0.0.1:13000/hub/api/auth',
      HUB_DATABASE_PATH: path.join(directory, '.nocobase/hub.sqlite'),
      HUB_RELEASE_ROOT: path.join(directory, 'app-dist'),
      PATH: '/bin',
    });
    expect(environment.PORT).toBeUndefined();
  });

  it('rejects a Hub port that collides with the App Host port', () => {
    expect(() =>
      createHubRuntimeEnvironment(
        { host: '127.0.0.1', name: 'example', port: 3000 },
        '/tmp/example-hub',
      ),
    ).toThrow(/APP Host also uses port 3000/);
  });

  it('writes a complete secret-bearing local environment without proxying a legacy API', () => {
    expect(
      formatHubLocalEnvironment(
        { host: '127.0.0.1', name: 'example', port: 13_000 },
        'a'.repeat(64),
      ),
    ).toBe(
      [
        'APP_NAME=hub',
        'APP_BASE_PATH=/hub',
        'APP_SERVER_HOST=127.0.0.1',
        'APP_SERVER_PORT=13000',
        'APP_HOST_BIND=127.0.0.1',
        'APP_HOST_PORT=3000',
        'AUTH_BASE_URL=http://127.0.0.1:13000/hub/api/auth',
        `AUTH_SECRET=${'a'.repeat(64)}`,
        'HUB_DATABASE_PATH=.nocobase/hub.sqlite',
        'HUB_RELEASE_ROOT=app-dist',
        'APP_PUBLIC_ORIGIN=http://127.0.0.1:3000',
        '',
      ].join('\n'),
    );
  });
});
