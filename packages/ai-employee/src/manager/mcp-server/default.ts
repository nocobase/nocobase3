import type { MCPEntity } from '../../repository/index.js';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  MultiServerMCPClient,
  StdioConnection,
  StreamableHTTPConnection,
} from '@langchain/mcp-adapters';
import { StructuredToolInterface } from '@langchain/core/tools';
import type { AIMCPRepository } from '../../repository/index.js';
import type { Context } from '../../runtime/context.js';
import type {
  MCPFilter,
  MCPServerManager,
  MCPOptions,
  MCPTestResult,
  MCPToolEntry,
  MCPRuntime,
} from './types.js';
import type {
  DynamicToolsProvider,
  Permission,
  ToolsRegistration,
  ToolsOptions,
} from '../tools/types.js';
import {
  normalizeMCPOptions,
  renderMCPOptions,
} from './mcp-options-renderer.js';
import { UserContextMCPClientManager } from './mcp-user-context-client-manager.js';

export class DefaultMCPServerManager implements MCPServerManager {
  private client: MultiServerMCPClient | null = null;
  private toolsMap: Record<string, StructuredToolInterface[]> = {};
  private toolsPermissionMap: Record<string, Permission> = {};
  private readonly userContextClientManager: UserContextMCPClientManager;

  constructor(
    private readonly repository: AIMCPRepository,
    private readonly runtime: MCPRuntime = {},
  ) {
    this.userContextClientManager = new UserContextMCPClientManager({
      runtime,
      listEntries: () => this.listMCP({ enabled: true, useUserContext: true }),
      buildConnection: (options) => this.buildMCPConnection(options),
    });
  }

  async registerMCP(registration: {
    [key: string | symbol]: MCPOptions;
  }): Promise<void> {
    for (const [name, options] of Object.entries(registration)) {
      const value = this.normalizeEntry(name, options);
      const current = await this.repository.findOne({ filter: { name } });
      if (current)
        await this.repository.update({ filter: { name }, values: value });
      else await this.repository.create({ values: value });
    }
  }

  async deleteMCP(name: string): Promise<void> {
    await this.repository.destroy({ filter: { name } });
  }

  async getMCP(name: string): Promise<MCPEntity | undefined> {
    return (await this.repository.findOne({ filter: { name } })) ?? undefined;
  }

  async listMCP(filter: MCPFilter = {}): Promise<MCPEntity[]> {
    const entries = await this.repository.find({
      filter: {
        ...(filter.enabled == null ? {} : { enabled: filter.enabled }),
        ...(filter.transport ? { transport: filter.transport } : {}),
        ...(filter.useUserContext == null
          ? {}
          : { useUserContext: filter.useUserContext }),
      },
      sort: ['sort', 'name'],
    });
    return filter.name
      ? entries.filter((entry) => entry.name.includes(filter.name!))
      : entries;
  }

  async rebuildClient(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // A stale client must not keep the repository-backed configuration from reloading.
      }
      this.client = null;
      this.toolsMap = {};
    }

    const entries = await this.listMCP({
      enabled: true,
      useUserContext: false,
    });
    if (entries.length === 0) return;

    const connections: Record<
      string,
      StdioConnection | StreamableHTTPConnection
    > = {};
    for (const entry of entries) {
      connections[entry.name] = this.buildMCPConnection(
        await renderMCPOptions(entry, this.runtime),
      );
    }

    this.client = new MultiServerMCPClient(connections);
    const toolsMap = await this.client.initializeConnections();
    for (const [serverName, tools] of Object.entries(toolsMap)) {
      this.toolsMap[serverName] = tools as StructuredToolInterface[];
      for (const tool of tools as StructuredToolInterface[]) {
        const toolName = `mcp-${serverName}-${tool.name}`;
        this.ensureToolPermission(toolName, tool.name);
      }
    }
  }

  getClient(): MultiServerMCPClient | null {
    return this.client;
  }

  getMCPToolsProvider(): DynamicToolsProvider {
    return async (register: ToolsRegistration, filter): Promise<void> => {
      for (const [serverName, tools] of Object.entries(this.toolsMap)) {
        await this.registerToolsFromMap(register, serverName, tools);
      }

      if (!filter?.ctx) return;
      const userToolsMap = await this.userContextClientManager.getToolsMap(
        filter.ctx,
      );
      for (const [serverName, tools] of Object.entries(userToolsMap)) {
        await this.registerToolsFromMap(register, serverName, tools);
      }
    };
  }

  async listMCPTools(ctx?: Context): Promise<Record<string, MCPToolEntry[]>> {
    const toolsMap = {
      ...this.toolsMap,
      ...(ctx ? await this.userContextClientManager.getToolsMap(ctx) : {}),
    };
    return this.formatMCPTools(toolsMap);
  }

  async updateMCPToolPermission(
    toolName: string,
    permission: Permission,
  ): Promise<void> {
    this.toolsPermissionMap[toolName] = permission;
  }

  async clearUserContextCache(): Promise<void> {
    await this.userContextClientManager.clear();
  }

  async testConnection(
    options: MCPOptions,
    ctx?: Context,
  ): Promise<MCPTestResult> {
    const renderedOptions = await renderMCPOptions(
      normalizeMCPOptions(options),
      this.runtime,
      ctx,
    );
    const { transport } = renderedOptions;
    if (!transport)
      return { success: false, error: 'Transport type is required' };
    if (transport === 'stdio' && !renderedOptions.command) {
      return {
        success: false,
        error: 'Command is required for stdio transport',
      };
    }
    if ((transport === 'http' || transport === 'sse') && !renderedOptions.url) {
      return {
        success: false,
        error: 'URL is required for HTTP/SSE transport',
      };
    }

    let client: MultiServerMCPClient | null = null;
    try {
      client = new MultiServerMCPClient({
        'test-server': this.buildMCPConnection(renderedOptions),
      });
      const toolsMap = await Promise.race([
        client.initializeConnections(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Connection timeout (60s)')),
            60000,
          ),
        ),
      ]);
      const tools = toolsMap['test-server'] || [];
      const names = tools.map((tool) => tool.name);
      return {
        success: true,
        message: 'Connection successful',
        toolsCount: tools.length,
        tools: names.slice(0, 20),
        toolsTruncated: names.length > 20,
      };
    } catch (error: any) {
      const message = error?.message || 'Failed to connect to MCP server';
      return {
        success: false,
        error: message,
        details: this.connectionHint(message, error?.stack),
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore cleanup failures from a failed probe.
        }
      }
    }
  }

  private async registerToolsFromMap(
    register: ToolsRegistration,
    serverName: string,
    tools: StructuredToolInterface[],
  ): Promise<void> {
    for (const tool of tools) {
      const toolName = `mcp-${serverName}-${tool.name}`;
      this.ensureToolPermission(toolName, tool.name);
      const toolOptions: ToolsOptions = {
        scope: 'GENERAL',
        from: 'mcp',
        defaultPermission: this.toolsPermissionMap[toolName],
        introduction: { title: tool.name, about: tool.description },
        definition: {
          name: toolName,
          description:
            tool.description || `MCP tool: ${tool.name} from ${serverName}`,
          schema: tool.schema,
        },
        invoke: async (_ctx: Context, args: any) => {
          try {
            return await tool.invoke(args);
          } catch (error: any) {
            return {
              status: 'error' as const,
              content: error?.message || 'Tool invocation failed',
            };
          }
        },
      };
      await register.registerTools(toolOptions);
    }
  }

  private ensureToolPermission(toolName: string, rawToolName: string): void {
    if (!(toolName in this.toolsPermissionMap)) {
      this.toolsPermissionMap[toolName] = rawToolName.startsWith('get')
        ? 'ALLOW'
        : 'ASK';
    }
  }

  private formatMCPTools(
    toolsMap: Record<string, StructuredToolInterface[]>,
  ): Record<string, MCPToolEntry[]> {
    return Object.fromEntries(
      Object.entries(toolsMap).map(([serverName, tools]) => [
        serverName,
        tools.map((tool) => {
          const toolName = `mcp-${serverName}-${tool.name}`;
          this.ensureToolPermission(toolName, tool.name);
          return {
            name: toolName,
            title: tool.name,
            description: tool.description,
            serverName,
            permission: this.toolsPermissionMap[toolName] ?? 'ASK',
          };
        }),
      ]),
    );
  }

  private buildMCPConnection(
    options: MCPOptions,
  ): StdioConnection | StreamableHTTPConnection {
    const { transport, command, args, env, url, headers, restart } = options;
    if (transport === 'stdio') {
      const connection: StdioConnection = {
        transport: 'stdio',
        command: command || '',
        args: args || [],
      };
      if (env && Object.keys(env).length) connection.env = env;
      if (restart && typeof restart === 'object' && !Array.isArray(restart))
        connection.restart = restart;
      return connection;
    }
    const connection: StreamableHTTPConnection = {
      transport: transport === 'sse' ? 'sse' : 'http',
      url: url || '',
    };
    if (headers && Object.keys(headers).length) connection.headers = headers;
    return connection;
  }

  private normalizeEntry(name: string, options: MCPOptions): MCPEntity {
    return normalizeMCPOptions({
      name,
      enabled: true,
      ...options,
      args: options.args ?? [],
      env: options.env ?? {},
      useUserContext: options.useUserContext === true,
    } as MCPEntity) as MCPEntity;
  }

  private connectionHint(message: string, stack?: string): string | undefined {
    let hint: string | undefined;
    if (message.includes('EACCES') || message.includes('permission denied'))
      hint = 'Try running: npm cache clean --force';
    else if (message.includes('ENOENT') || message.includes('not found'))
      hint = 'Make sure the command exists and is accessible';
    else if (message.includes('timeout'))
      hint =
        'The server took too long to respond. Check if the server is running correctly.';
    return hint ? `Hint: ${hint}\n\n${stack || ''}` : stack;
  }
}

export function defineMCP(options: MCPOptions) {
  return options;
}
