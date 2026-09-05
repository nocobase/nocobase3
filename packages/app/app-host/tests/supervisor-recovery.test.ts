import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHostSupervisor } from '../dist/supervisor.js';
import type {
  HostDeploymentSet,
  HostDeploymentSpec,
  HostManagementService,
  HostStatus,
} from '../dist/management/index.js';

let supervisor: AppHostSupervisor | undefined;
afterEach(async () => {
  await supervisor?.shutdown();
});

describe('supervisor recovery snapshot', () => {
  it('retains successful deployments after failed operations and updates policy without IPC', async () => {
    supervisor = AppHostSupervisor.initialize({ mode: 'managed' });
    const deployment: HostDeploymentSpec = {
      id: 'a',
      appId: 'a',
      artifact: { appId: 'a', version: '1', checksum: 'old', key: 'old' },
      backend: 'in-process',
      desiredState: 'running',
      activation: 'eager',
      config: { provider: 'file', path: '/old.yml' },
    };
    const status: HostStatus = {
      mode: 'managed',
      ready: true,
      desiredRevision: 1,
      reconciledRevision: 1,
      deployments: [
        {
          id: 'a',
          appId: 'a',
          desiredState: 'running',
          observedState: 'running',
          revision: 1,
          cacheHit: true,
          app: null,
          error: null,
        },
      ],
    };
    const client = {
      applyDeployment: vi.fn(async () => status),
      startDeployment: vi.fn(async () => status),
      applyDeploymentSet: vi.fn(async () => ({ accepted: true, status })),
    };
    const management = vi
      .spyOn(supervisor, 'getManagementClient')
      .mockResolvedValue(client as unknown as HostManagementService);
    const snapshot = () =>
      (supervisor as unknown as { lastDeploymentSet: HostDeploymentSet })
        .lastDeploymentSet;
    await supervisor.applyDeployment(deployment);
    expect(snapshot().deployments).toEqual([deployment]);
    const failed = {
      ...deployment,
      artifact: { ...deployment.artifact, key: 'failed' },
      config: { provider: 'file' as const, path: '/failed.yml' },
    };
    status.deployments[0]!.observedState = 'failed';
    await supervisor.applyDeployment(failed);
    await supervisor.startDeployment(failed);
    await supervisor.applyDeploymentSet({ revision: 1, deployments: [failed] });
    expect(snapshot().deployments).toEqual([deployment]);
    client.applyDeployment.mockRejectedValueOnce(new Error('IPC disconnected'));
    await expect(supervisor.applyDeployment(failed)).rejects.toThrow(
      'IPC disconnected',
    );
    expect(snapshot().deployments).toEqual([deployment]);
    management.mockClear();
    supervisor.updateStartupPolicy('a', 'lazy');
    expect(snapshot().deployments[0]).toEqual({
      ...deployment,
      activation: 'lazy',
    });
    supervisor.updateStartupPolicy('a', 'eager');
    expect(snapshot().deployments).toEqual([deployment]);
    expect(management).not.toHaveBeenCalled();
  });

  it('does not remember a failed initial deployment', async () => {
    supervisor = AppHostSupervisor.initialize({ mode: 'managed' });
    vi.spyOn(supervisor, 'getManagementClient').mockResolvedValue({
      applyDeployment: async () => ({
        desiredRevision: 1,
        deployments: [{ appId: 'a', observedState: 'failed' }],
      }),
    } as unknown as HostManagementService);
    await supervisor.applyDeployment({
      id: 'a',
      appId: 'a',
      artifact: { appId: 'a', version: '1', checksum: 'bad', key: 'bad' },
      backend: 'in-process',
      desiredState: 'running',
    });
    expect(
      (supervisor as unknown as { lastDeploymentSet: unknown })
        .lastDeploymentSet,
    ).toBeNull();
  });
});
