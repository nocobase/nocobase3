import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, type TestAI } from './mock-server.js';
import path from 'path';
import { AIManager } from '../manager/index.js';
import { MCPLoader } from '../loader/mcp.js';
import type { MCPServerManager } from '../manager/mcp-server/types.js';
import { DefaultMCPServerManager } from '../manager/mcp-server/default.js';

describe('MCP loader test cases', () => {
  const basePath = path.resolve(
    process.cwd(),
    'src/__tests__',
    'resource',
    'ai',
  );
  let app: TestAI;
  let aiManager: AIManager;
  let mcpServerManager: MCPServerManager;
  let loader: MCPLoader;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['nocobase'],
    });

    aiManager = app.aiManager;
    mcpServerManager = aiManager.mcpServerManager;
    loader = new MCPLoader(aiManager, {
      scan: {
        basePath,
        pattern: ['**/mcp/*.ts', '!**/mcp/*.d.ts'],
      },
    });
  });

  afterEach(async () => {
    await app.destroy?.();
  });

  it('should load mcp definitions in mcp root directory', async () => {
    await loader.load();
    await app.init();

    const entry = await mcpServerManager.getMCP('weather');
    expect(entry).toBeDefined();
    expect(entry.name).toBe('weather');
    expect(entry.enabled).toBe(true);
    expect(entry.transport).toBe('http');
    expect(entry.url).toBe('http://localhost:8123/mcp');
    expect(entry.headers).toEqual({
      Authorization: 'Bearer test-token',
    });
    expect(entry.env).toEqual({
      MCP_ENV: 'test',
    });
    expect(entry.args).toEqual(['--foo']);
    expect(entry.restart).toEqual({
      enabled: true,
    });

    const enabledEntries = await mcpServerManager.listMCP({
      enabled: true,
      transport: 'http',
      name: 'weath',
    });
    expect(enabledEntries.map((item) => item.name)).toEqual(['weather']);
  });

  it('should expose cached mcp tools and allow updating permissions', async () => {
    await mcpServerManager.registerMCP({
      weather: { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
    });
    const manager = mcpServerManager as any;
    manager.toolsMap = {
      weather: [
        {
          name: 'getForecast',
          description: 'Get weather forecast',
        },
        {
          name: 'setDefaultCity',
          description: 'Set default city',
        },
      ],
    };

    const tools = await mcpServerManager.listMCPTools();
    expect(tools.weather).toEqual([
      {
        name: 'mcp-weather-getForecast',
        title: 'getForecast',
        description: 'Get weather forecast',
        serverName: 'weather',
        permission: 'ALLOW',
      },
      {
        name: 'mcp-weather-setDefaultCity',
        title: 'setDefaultCity',
        description: 'Set default city',
        serverName: 'weather',
        permission: 'ASK',
      },
    ]);

    await mcpServerManager.updateMCPToolPermission(
      'mcp-weather-getForecast',
      'ALLOW',
    );

    const updatedTools = await mcpServerManager.listMCPTools();
    expect(updatedTools.weather[0].permission).toBe('ALLOW');
    expect(updatedTools.weather[1].permission).toBe('ASK');
  });

  it('keeps a server an administrator disabled disabled when the config is synced again', async () => {
    const server = {
      transport: 'http' as const,
      url: 'http://127.0.0.1:1/mcp',
    };
    await mcpServerManager.registerMCP({ search: server });
    await mcpServerManager.updateMCPEnabled('search', false);

    await mcpServerManager.registerMCP({
      search: { ...server, url: 'http://127.0.0.1:2/mcp' },
    });

    const entry = await mcpServerManager.getMCP('search');
    expect(entry?.enabled).toBe(false);
    expect(entry?.url).toBe('http://127.0.0.1:2/mcp');
  });

  it('saves a tool permission on the server and loads it after a restart', async () => {
    await mcpServerManager.registerMCP({
      weather: { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
    });
    const manager = mcpServerManager as any;
    manager.toolsMap = {
      weather: [{ name: 'setDefaultCity', description: 'Set default city' }],
    };
    await mcpServerManager.listMCPTools();

    await mcpServerManager.updateMCPToolPermission(
      'mcp-weather-setDefaultCity',
      'ALLOW',
    );

    expect((await mcpServerManager.getMCP('weather'))?.toolPermissions).toEqual(
      { setDefaultCity: 'ALLOW' },
    );
    // A new process: same stored rows, nothing in memory.
    const restarted = new DefaultMCPServerManager(manager.repository);
    await restarted.rebuildClient().catch(() => undefined);
    (restarted as any).toolsMap = manager.toolsMap;
    const tools = await restarted.listMCPTools();
    expect(tools.weather?.[0]?.permission).toBe('ALLOW');
  });

  it('refuses a permission for a tool no connected server exposes', async () => {
    await mcpServerManager.registerMCP({
      weather: { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
    });

    await expect(
      mcpServerManager.updateMCPToolPermission(
        'mcp-weather-setDefaultCity',
        'ALLOW',
      ),
    ).rejects.toThrow('MCP tool is not available: mcp-weather-setDefaultCity');
    expect(
      (await mcpServerManager.getMCP('weather'))?.toolPermissions ?? {},
    ).toEqual({});
    const tools = await mcpServerManager.listMCPTools();
    expect(tools.weather).toBeUndefined();
  });

  it('refuses a permission for a tool whose server is no longer saved', async () => {
    const manager = mcpServerManager as any;
    manager.toolsMap = {
      weather: [{ name: 'setDefaultCity', description: 'Set default city' }],
    };
    await mcpServerManager.listMCPTools();

    await expect(
      mcpServerManager.updateMCPToolPermission(
        'mcp-weather-setDefaultCity',
        'ALLOW',
      ),
    ).rejects.toThrow('MCP server is not saved: weather');
    const tools = await mcpServerManager.listMCPTools();
    expect(tools.weather?.[0]?.permission).toBe('ASK');
  });

  it('logs a server it cannot reach instead of failing, and exposes none of its tools', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const manager = new DefaultMCPServerManager(
      (mcpServerManager as any).repository,
      { logger },
    );
    await manager.registerMCP({
      unreachable: {
        transport: 'http',
        url: 'http://fake-user:fake-password@127.0.0.1:1/mcp/fake-path?token=fake-token',
      },
    });

    await expect(manager.rebuildClient()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'unreachable' }),
      expect.stringContaining('unreachable'),
    );
    // The adapter quotes the URL; nothing but its origin may reach the log.
    const logged = JSON.stringify([
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls,
    ]);
    expect(logged).toContain('http://127.0.0.1:1');
    for (const secret of [
      'fake-token',
      'fake-password',
      'fake-user',
      'fake-path',
    ])
      expect(logged).not.toContain(secret);
    expect((await manager.listMCPTools()).unreachable).toBeUndefined();
  });
});
