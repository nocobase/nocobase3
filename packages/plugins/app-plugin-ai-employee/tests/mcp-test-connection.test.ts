import { AIManager, MemoryRepositoryFactory } from '@nocobase/ai-employee';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIMCPServerService } from '../server/service/ai-mcp-server-service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

async function createService() {
  const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
  vi.spyOn(ai.mcpServerManager, 'rebuildClient').mockResolvedValue(
    undefined as never,
  );
  // The probe itself is not under test, and a real stdio probe would spawn.
  const probe = vi
    .spyOn(ai.mcpServerManager, 'testConnection')
    .mockResolvedValue({ success: true, toolsCount: 0 });
  const service = new AIMCPServerService({ ai });
  await service.syncConfiguredMCPServers({
    local: { transport: 'stdio', command: 'configured-command', args: ['-v'] },
  });
  return { service, probe };
}

describe('AIMCPServerService.testConnection', () => {
  it('rejects an inline stdio server without spawning it', async () => {
    const { service, probe } = await createService();

    await expect(
      service.testConnection({
        input: { transport: 'stdio', command: 'touch', args: ['/tmp/pwned'] },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(probe).not.toHaveBeenCalled();
  });

  it('tests a configured stdio server by name and ignores the body', async () => {
    const { service, probe } = await createService();

    await service.testConnection({
      input: {
        name: 'local',
        transport: 'stdio',
        command: 'touch',
        args: ['/tmp/pwned'],
      },
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(probe.mock.calls[0][0]).toMatchObject({
      transport: 'stdio',
      command: 'configured-command',
      args: ['-v'],
    });
  });

  it('does not fall back to the body for an unknown or blank name', async () => {
    const { service, probe } = await createService();

    for (const name of ['missing', '', 42]) {
      await expect(
        service.testConnection({
          input: { name, transport: 'stdio', command: 'touch' },
        }),
      ).rejects.toMatchObject({ status: name === 'missing' ? 404 : 400 });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('still tests an inline remote server', async () => {
    const { service, probe } = await createService();

    await service.testConnection({
      input: { transport: 'http', url: 'https://example.test/mcp' },
    });
    expect(probe.mock.calls[0][0]).toMatchObject({
      transport: 'http',
      url: 'https://example.test/mcp',
    });
  });
});
