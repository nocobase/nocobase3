import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
