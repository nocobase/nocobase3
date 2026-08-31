import type { AIMCPRepository, MCPEntity } from '../ai-mcp.js';
import { MemoryCollectionRepository } from './collection.js';

export class MemoryMCPRepository
  extends MemoryCollectionRepository<MCPEntity>
  implements AIMCPRepository {}
