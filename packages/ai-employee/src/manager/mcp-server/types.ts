import type { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { RuntimeLogger } from '../../runtime/logger.js';
import type { DynamicToolsProvider, Permission } from '../tools/types.js';
import type { MCPEntity } from '../../repository/index.js';

export type MCPRuntime = {
  logger?: Pick<RuntimeLogger, 'error' | 'warn'>;
};

export interface MCPServerManager extends MCPRegistration {
  getMCP(name: string): Promise<MCPEntity | undefined>;
  listMCP(filter?: MCPFilter): Promise<MCPEntity[]>;
  deleteMCP(name: string): Promise<void>;
  testConnection(options: MCPOptions): Promise<MCPTestResult>;
  rebuildClient(): Promise<void>;
  getClient(): MultiServerMCPClient | null;
  getMCPToolsProvider(): DynamicToolsProvider;
  listMCPTools(): Promise<Record<string, MCPToolEntry[]>>;
  updateMCPToolPermission(
    toolName: string,
    permission: Permission,
  ): Promise<void>;
}

export interface MCPRegistration {
  registerMCP(registration: {
    [key: string | symbol]: MCPOptions;
  }): Promise<void>;
}

export type MCPOptions = {
  transport: MCPTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  restart?: Record<string, any>;
};

export type MCPFilter = {
  name?: string;
  enabled?: boolean;
  transport?: MCPTransport;
};

export type MCPTransport = 'stdio' | 'sse' | 'http';
export type MCPTestResult = {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
  toolsCount?: number;
  tools?: string[];
  toolsTruncated?: boolean;
};
export type MCPToolEntry = {
  name: string;
  title: string;
  description?: string;
  serverName: string;
  permission: Permission;
};
