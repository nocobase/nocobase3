import { describe, expect, it } from 'vitest';
import { buildHubEnvFile, generateAuthSecret } from '../src/lib/env-file.ts';

describe('buildHubEnvFile', () => {
  it('writes a runnable loopback Hub configuration', () => {
    const contents = buildHubEnvFile({ authSecret: 's'.repeat(43) });

    expect(contents).toContain('APP_NAME=hub\n');
    expect(contents).toContain('APP_BASE_PATH=/hub\n');
    expect(contents).toContain('APP_SERVER_HOST=127.0.0.1\n');
    expect(contents).toContain('APP_SERVER_PORT=13000\n');
    expect(contents).toContain('APP_HOST_BIND=127.0.0.1\n');
    expect(contents).toContain('APP_HOST_PORT=3000\n');
    expect(contents).toContain(`AUTH_SECRET=${'s'.repeat(43)}\n`);
    expect(contents).toContain('HUB_DATABASE_PATH=.nocobase/hub.sqlite\n');
    expect(contents).toContain('HUB_RELEASE_ROOT=app-dist\n');
    expect(contents).toContain('APP_PUBLIC_ORIGIN=http://127.0.0.1:3000\n');
  });

  it('generates an independent secret with at least 32 bytes of entropy', () => {
    const first = generateAuthSecret();
    const second = generateAuthSecret();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(second).not.toBe(first);
  });
});
