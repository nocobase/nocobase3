import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import {
  IpcHostManagementClient,
  IpcHostManagementServer,
  type HostManagementService,
} from '../dist/management/index.js';

it('routes configuration reload through IPC and propagates results and errors', async () => {
  const child = new EventEmitter() as ChildProcess;
  Object.defineProperty(child, 'connected', { value: true });
  child.send = ((message: unknown, callback: (error: Error | null) => void) => {
    process.emit('message', message as never, undefined);
    callback(null);
    return true;
  }) as ChildProcess['send'];
  const originalSend = Object.getOwnPropertyDescriptor(process, 'send');
  Object.defineProperty(process, 'send', {
    configurable: true,
    value: (message: unknown) => child.emit('message', message),
  });
  const reloadAppConfig = vi
    .fn<HostManagementService['reloadAppConfig']>()
    .mockResolvedValueOnce({ changedNamespaces: ['feature'] })
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('Configuration validation failed'));
  const server = new IpcHostManagementServer(
    { reloadAppConfig } as HostManagementService,
    'test',
  );
  const client = new IpcHostManagementClient(child, { session: 'test' });
  try {
    server.attach();
    await expect(client.reloadAppConfig('customer')).resolves.toEqual({
      changedNamespaces: ['feature'],
    });
    await expect(client.reloadAppConfig('customer')).resolves.toBeNull();
    await expect(client.reloadAppConfig('customer')).rejects.toThrow(
      'Configuration validation failed',
    );
    expect(reloadAppConfig).toHaveBeenNthCalledWith(1, 'customer');
    expect(child.listenerCount('message')).toBe(0);
  } finally {
    server.close();
    if (originalSend) Object.defineProperty(process, 'send', originalSend);
    else Reflect.deleteProperty(process, 'send');
  }
});
