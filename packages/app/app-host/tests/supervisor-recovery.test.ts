import { afterEach, expect, it, vi } from 'vitest';
import { AppHostSupervisor } from '../dist/supervisor.js';
import type {
  HostManagementService,
  HostDeploymentSet,
} from '../dist/management/index.js';
let supervisor: AppHostSupervisor | undefined;
afterEach(async () => {
  await supervisor?.shutdown();
});
it('forwards controller-owned recovery targets without keeping a second snapshot', async () => {
  supervisor = AppHostSupervisor.initialize({
    mode: 'managed',
    enabled: false,
  });
  const restoreDeploymentSet = vi
    .fn()
    .mockRejectedValueOnce(new Error('Host exited'))
    .mockResolvedValue({ accepted: true, status: {} });
  vi.spyOn(supervisor, 'getManagementClient').mockResolvedValue({
    restoreDeploymentSet,
  } as unknown as HostManagementService);
  const initial: HostDeploymentSet = { revision: 1, deployments: [] };
  await expect(supervisor.restoreDeploymentSet(initial)).rejects.toThrow(
    'Host exited',
  );
  const latest: HostDeploymentSet = { revision: 2, deployments: [] };
  await supervisor.restoreDeploymentSet(latest);
  expect(restoreDeploymentSet).toHaveBeenLastCalledWith(latest);
  expect('lastDeploymentSet' in supervisor).toBe(false);
});
