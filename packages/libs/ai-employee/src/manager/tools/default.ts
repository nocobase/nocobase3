import type { ToolsEntity } from '../../repository/tool.js';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ToolsRepository } from '../../repository/tool.js';
import type {
  DynamicToolsProvider,
  ToolsFilter,
  ToolsManager,
  ToolsOptions,
  ToolsRegistration,
} from './types.js';
import _ from 'lodash';

export class DefaultToolsManager<
  TContext = unknown,
> implements ToolsManager<TContext> {
  constructor(
    private readonly repository: ToolsRepository<TContext>,
    private readonly dynamicTools: DynamicToolsProvider<TContext>[] = [],
  ) {}

  async getTools(
    toolName: string,
    filter?: ToolsFilter<TContext>,
  ): Promise<ToolsEntity<TContext> | undefined> {
    const target = await this.repository.getTools(toolName);
    if (target && this.matchesFilter(target, filter)) {
      return target;
    }
    const dynamicTools = await this.syncDynamicTools(filter);
    return dynamicTools.find((tool) => tool.definition.name === toolName);
  }

  async listTools(
    filter?: ToolsFilter<TContext>,
  ): Promise<ToolsEntity<TContext>[]> {
    const [staticTools, dynamicTools] = await Promise.all([
      this.repository.listTools(filter),
      this.syncDynamicTools(filter),
    ]);
    return [...staticTools, ...dynamicTools].filter((tool) =>
      this.matchesFilter(tool, filter),
    );
  }

  async isToolsExisted(toolName: string): Promise<boolean> {
    return Boolean(await this.repository.getTools(toolName));
  }

  async unregisterTools(toolName: string | string[]): Promise<number> {
    const names = _.isArray(toolName) ? toolName : [toolName];
    let deleted = 0;
    for (const name of names) {
      if (await this.repository.getTools(name)) {
        await this.repository.deleteTools(name);
        deleted += 1;
      }
    }
    return deleted;
  }

  async registerTools(
    options: ToolsOptions<TContext> | ToolsOptions<TContext>[],
  ): Promise<void> {
    const list = _.isArray(options) ? options : [options];
    for (const option of list) {
      const entry = normalizeToolsEntity(option);
      await this.repository.createOrUpdateTools({ value: entry });
    }
  }

  registerDynamicTools(provider: DynamicToolsProvider<TContext>): void {
    this.dynamicTools.push(provider);
  }

  private matchesFilter(
    entry: ToolsEntity<TContext>,
    filter?: ToolsFilter<TContext>,
  ): boolean {
    if (!filter) return true;
    if (filter.scope && filter.scope !== entry.scope) return false;
    if (
      filter.defaultPermission &&
      filter.defaultPermission !== entry.defaultPermission
    )
      return false;
    if (filter.silence != null && filter.silence !== entry.silence)
      return false;
    return true;
  }

  private async syncDynamicTools(
    filter?: ToolsFilter<TContext>,
  ): Promise<ToolsEntity<TContext>[]> {
    if (this.dynamicTools.length === 0) return [];

    const entries = new Map<string, ToolsEntity<TContext>>();
    const registration: ToolsRegistration<TContext> = {
      registerTools: async (options) => {
        const list = _.isArray(options) ? options : [options];
        for (const option of list) {
          const entry = normalizeToolsEntity(option);
          entries.set(entry.definition.name, entry);
        }
      },
      registerDynamicTools: () => {
        throw new Error('Dynamic tools cannot register nested dynamic tools');
      },
    };
    await Promise.all(
      this.dynamicTools.map((register) => register(registration, filter)),
    );
    return [...entries.values()];
  }
}

export function normalizeToolsEntity<TContext = unknown>(
  options: ToolsOptions<TContext>,
): ToolsEntity<TContext> {
  const entry = {
    ...options,
    definition: { ...options.definition },
  } as ToolsEntity<TContext>;
  entry.from ??= 'loader';
  entry.execution ??= 'backend';
  entry.defaultPermission ??= 'ASK';
  entry.silence = entry.silence === true;
  entry.introduction ??= { title: entry.definition.name };
  return entry;
}

export function defineTools<TContext = unknown>(
  options: ToolsOptions<TContext>,
): ToolsOptions<TContext> {
  return options;
}

export const SYSTEM_TOOLS = {
  GET_SKILL: 'getSkill',
  WEB_SEARCH: 'subAgentWebSearch',
  KNOWLEDGE_BASE: 'knowledge-base-retrieve',
  WORK_FLOW_TASK_OUTPUT: 'aiEmployeeWorkflowTaskOutput',
};

export const listSystemTools = () => Object.values(SYSTEM_TOOLS);
