import { EventEmitter } from 'node:events';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn }));

import { pullHubSource } from '../src/lib/hub-source.ts';

beforeEach(() => {
  spawn.mockReset();
});

describe('pullHubSource', () => {
  it('runs the packaged app executable with an absolute target and inherited stdio', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);
    const pulling = pullHubSource({
      app: 'sales',
      appExecutable: '/package/bin/app.js',
      hub: 'https://hub.example.com/hub',
      targetDirectory: './sales',
    });
    queueMicrotask(() => child.emit('close', 0));

    await pulling;

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        '/package/bin/app.js',
        'pull',
        '--initialize',
        '--dir',
        path.resolve('./sales'),
        '--hub',
        'https://hub.example.com/hub',
        '--app',
        'sales',
        '--non-interactive',
      ],
      expect.objectContaining({
        shell: false,
        stdio: 'inherit',
      }),
    );
  });

  it('rejects when the app executable exits unsuccessfully', async () => {
    const child = new EventEmitter();
    spawn.mockReturnValue(child);
    const pulling = pullHubSource({
      app: 'sales',
      appExecutable: '/package/bin/app.js',
      hub: 'https://hub.example.com/hub',
      targetDirectory: './sales',
    });
    queueMicrotask(() => child.emit('close', 9));

    await expect(pulling).rejects.toThrow(/exit code 9/u);
  });
});
