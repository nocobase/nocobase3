import type { ToolsEntity, ToolsQuery, ToolsRepository } from '../tool.js';

/**
 * Executable tool functions cannot be serialized to a business database
 * transaction snapshots.  Keep them in this App-owned in-memory repository;
 * both loaders and management use the same instance supplied to ToolsManager.
 */
export class MemoryToolsRepository implements ToolsRepository {
  private readonly tools = new Map<string, ToolsEntity>();

  async createTools(input: { value: ToolsEntity }): Promise<ToolsEntity> {
    const name = input.value.definition.name;
    if (this.tools.has(name)) throw new Error(`Tool already exists: ${name}`);
    this.tools.set(name, input.value);
    return input.value;
  }

  async updateTools(input: {
    name: string;
    value: Partial<ToolsEntity>;
  }): Promise<ToolsEntity | undefined> {
    const current = this.tools.get(input.name);
    if (!current) return undefined;
    const next = { ...current, ...input.value } as ToolsEntity;
    this.tools.set(input.name, next);
    return next;
  }

  async deleteTools(name: string): Promise<void> {
    this.tools.delete(name);
  }

  async getTools(name: string): Promise<ToolsEntity | undefined> {
    return this.tools.get(name);
  }

  async listTools(query: ToolsQuery = {}): Promise<ToolsEntity[]> {
    return [...this.tools.values()].filter((tool) => {
      if (query.scope && tool.scope !== query.scope) return false;
      if (
        query.defaultPermission &&
        tool.defaultPermission !== query.defaultPermission
      )
        return false;
      if (query.silence != null && tool.silence !== query.silence) return false;
      return true;
    });
  }

  async createOrUpdateTools(input: {
    value: ToolsEntity;
  }): Promise<{ value: ToolsEntity; replaced: boolean }> {
    const name = input.value.definition.name;
    const replaced = this.tools.has(name);
    this.tools.set(name, input.value);
    return { value: input.value, replaced };
  }
}
