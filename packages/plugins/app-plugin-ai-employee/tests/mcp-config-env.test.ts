import { AIManager, MemoryRepositoryFactory } from '@nocobase/ai-employee';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIMCPServerService } from '../server/service/ai-mcp-server-service.js';

const KEY = 'AI_MCP_TEST_TOKEN';

afterEach(() => {
  delete process.env[KEY];
  vi.restoreAllMocks();
});

describe('syncConfiguredMCPServers', () => {
  it('expands environment references in headers, args and env', async () => {
    process.env[KEY] = 'real-token';
    const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
    // Connecting is not what this asserts, and a stdio server would spawn.
    vi.spyOn(ai.mcpServerManager, 'rebuildClient').mockResolvedValue(
      undefined as never,
    );

    await new AIMCPServerService({ ai }).syncConfiguredMCPServers({
      remote: {
        transport: 'http',
        url: 'https://example.test',
        headers: { Authorization: `Bearer \${${KEY}}` },
      },
      local: {
        transport: 'stdio',
        command: 'npx',
        args: ['--token', `\${${KEY}}`],
        env: { TOKEN: `\${${KEY}}`, MISSING: '${AI_MCP_ABSENT}' },
      },
    });

    const servers = await ai.mcpServerManager.listMCP({});
    const byName = new Map(servers.map((server) => [server.name, server]));
    expect(byName.get('remote')?.headers).toEqual({
      Authorization: 'Bearer real-token',
    });
    expect(byName.get('local')?.args).toEqual(['--token', 'real-token']);
    expect(byName.get('local')?.env).toEqual({
      TOKEN: 'real-token',
      MISSING: '',
    });
  });
});
