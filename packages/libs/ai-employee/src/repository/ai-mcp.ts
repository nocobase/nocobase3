import type { CollectionRepository } from './collection.js';

export type MCPEntity = {
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  restart?: Record<string, any>;
  sort?: number;
  /** Permissions an administrator set, keyed by the server's own tool name. */
  toolPermissions?: Record<string, 'ASK' | 'ALLOW'>;
};

export interface AIMCPRepository extends CollectionRepository<MCPEntity> {}
