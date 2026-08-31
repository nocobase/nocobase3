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
};

export interface AIMCPRepository extends CollectionRepository<MCPEntity> {}
