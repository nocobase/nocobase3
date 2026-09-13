// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePortalEnv } from '../../vite.config';

const temporaryRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('portal Vite environment', () => {
  it('loads APP_BASE_PATH from the application env files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-vite-env-'));
    temporaryRoots.push(root);
    writeFileSync(path.join(root, '.env.local'), 'APP_BASE_PATH=/hub\n');

    const previous = process.env.APP_BASE_PATH;
    delete process.env.APP_BASE_PATH;
    try {
      expect(resolvePortalEnv('production', root).APP_BASE_PATH).toBe('/hub');
    } finally {
      if (previous === undefined) {
        delete process.env.APP_BASE_PATH;
      } else {
        process.env.APP_BASE_PATH = previous;
      }
    }
  });

  it('lets an explicit process environment override env files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-vite-env-'));
    temporaryRoots.push(root);
    writeFileSync(path.join(root, '.env.local'), 'APP_BASE_PATH=/from-file\n');
    vi.stubEnv('APP_BASE_PATH', '/from-process');

    expect(resolvePortalEnv('production', root).APP_BASE_PATH).toBe(
      '/from-process',
    );
  });
});
