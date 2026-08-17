/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRuntimeRegistry } from '../dist/app-registry.js';
import { writeAppSystemLog } from '../dist/app-system-log.js';
import type { AppActivationBackend } from '../dist/app-types.js';

const tempRoots: string[] = [];

const getDateStamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

const readJsonLines = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('app-host system log', () => {
  it('writes embedded app initialization failures to the app system log', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-host-log-'));
    tempRoots.push(rootDir);

    const createError = new Error('boom from embedded createApp');
    const registry = new AppRuntimeRegistry({
      backend: {
        kind: 'in-process',
        activate: async () => {
          throw createError;
        },
      } as AppActivationBackend,
      resolveFactory: () => () => ({
        fetch: () => new Response(null),
      }),
      startEvictionLoop: false,
    });

    await registry.register('main', {
      appName: 'main',
      basePath: '/main',
      rootDir,
    });
    registry.events.on('app:createFailed', (event) => {
      const definition = registry.definition(event.appId);
      expect(definition?.rootDir).toBe(rootDir);

      writeAppSystemLog({
        level: 'error',
        msg: 'Embedded App failed to initialize',
        definition,
        error: event.error,
        fields: {
          event: 'app:createFailed',
          version: event.version,
          state: event.state,
          basePath: event.basePath,
        },
      });
    });

    try {
      await expect(registry.ensureActive('main')).rejects.toThrow('App "main" failed to initialize');
    } finally {
      await registry.destroyAll('test cleanup');
    }

    const systemFile = path.join(rootDir, 'logs', 'embedded', `system-${getDateStamp()}.log`);
    const logs = readJsonLines(systemFile);

    expect(logs.at(-1)).toMatchObject({
      channel: 'system',
      mode: 'embedded',
      appName: 'main',
      appId: 'main',
      basePath: '/main',
      event: 'app:createFailed',
      msg: 'Embedded App failed to initialize',
      err: {
        message: 'boom from embedded createApp',
      },
    });
  });
});
