import type { AIEmployeeEntity } from '../../repository/index.js';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AIEmployeeRepository } from '../../repository/index.js';

import type {
  AIEmployeeFilter,
  AIEmployeeManager,
  AIEmployeeOptions,
} from './types.js';

const DEFAULT_KNOWLEDGE_BASE = {
  topK: 3,
  score: 0.6,
  knowledgeBaseKeys: [],
  retrievalStrategy: 'onDemand' as const,
};
const DEFAULT_KNOWLEDGE_BASE_PROMPT =
  "From knowledge base:\n{knowledgeBaseData}\nanswer user's question using this information.";

/**
 * The employee manager owns loader-to-entity conversion and can promote
 * resources from its initial repository into host-provided persistent storage.
 */
export class DefaultAIEmployeeManager implements AIEmployeeManager {
  private repository: AIEmployeeRepository;
  constructor(repository: AIEmployeeRepository) {
    this.repository = repository;
  }

  async getEmployee(username: string): Promise<AIEmployeeEntity | undefined> {
    return (
      (await this.repository.findOne({ filter: { username } })) ?? undefined
    );
  }

  async listEmployees(
    filter: AIEmployeeFilter = {},
  ): Promise<AIEmployeeEntity[]> {
    return this.repository
      .find({
        filter: {
          ...(filter.builtIn == null ? {} : { builtIn: filter.builtIn }),
        },
        sort: ['sort', 'username'],
      })
      .then((entries) =>
        filter.username
          ? entries.filter((entry) => entry.username.includes(filter.username!))
          : entries,
      );
  }

  async registerEmployee(options: AIEmployeeOptions): Promise<void> {
    await this.registerEmployeeInRepository(this.repository, options);
  }

  async switchRepository(repository: AIEmployeeRepository): Promise<void> {
    if (repository === this.repository) return;
    const employees = await this.repository.find({
      sort: ['sort', 'username'],
    });
    for (const employee of employees) {
      await this.registerEmployeeInRepository(
        repository,
        this.toEmployeeOptions(employee),
        employee.skillSettings,
      );
    }
    this.repository = repository;
  }

  async upsertEmployee(entry: AIEmployeeEntity): Promise<AIEmployeeEntity> {
    const current = await this.repository.findOne({
      filter: { username: entry.username },
    });
    const values: AIEmployeeEntity = {
      ...entry,
      skillSettings: { ...entry.skillSettings },
    };
    for (const key of ['enabledSkills', 'enabledTools'] as const) {
      const selection =
        entry.skillSettings[key] === undefined
          ? current?.skillSettings?.[key]
          : entry.skillSettings[key];
      if (
        selection != null &&
        (!Array.isArray(selection) ||
          !selection.every(
            (name) => typeof name === 'string' && name.trim().length > 0,
          ))
      ) {
        throw new TypeError(
          `skillSettings.${key} must be an array of non-empty strings or null`,
        );
      }
      if (selection !== undefined) {
        values.skillSettings[key] =
          selection === null ? null : [...new Set(selection)];
      }
    }
    if (current) {
      await this.repository.update({
        filter: { username: entry.username },
        values,
      });
      return { ...current, ...values };
    }
    return this.repository.create({ values });
  }

  async deleteEmployee(username: string): Promise<void> {
    await this.repository.destroy({ filter: { username } });
  }

  private async registerEmployeeInRepository(
    repository: AIEmployeeRepository,
    options: AIEmployeeOptions,
    sourceSettings?: AIEmployeeEntity['skillSettings'],
  ): Promise<void> {
    const current =
      (await repository.findOne({
        filter: { username: options.username },
      })) ?? undefined;
    const value = this.toBuiltInEmployee(options, current);
    // Registration refreshes legacy arrays, never an administrator's override.
    for (const key of ['enabledSkills', 'enabledTools'] as const) {
      const selection =
        current?.skillSettings?.[key] !== undefined
          ? current.skillSettings[key]
          : sourceSettings?.[key];
      if (selection !== undefined) {
        value.skillSettings[key] =
          selection === null ? null : [...new Set(selection)];
      }
    }
    if (Array.isArray(value.skillSettings.enabledTools)) {
      // The manager cannot classify dynamic tools by scope. Keep all saved
      // settings; runtime only consults these permissions for CUSTOM tools.
      // Saved ASK must win over a subsequently registered ALLOW default.
      value.skillSettings.tools = [
        ...new Map(
          [
            ...value.skillSettings.tools,
            ...(sourceSettings?.tools ?? []),
            ...(current?.skillSettings?.tools ?? []),
          ].map((tool) => [tool.name, tool]),
        ).values(),
      ];
    }
    // Approval overrides are independent of selection overrides. Legacy
    // employees still inherit the registered tool list, but not new approval
    // defaults for names whose permissions have already been saved.
    const savedTools = new Map(
      [
        ...(sourceSettings?.tools ?? []),
        ...(current?.skillSettings?.tools ?? []),
      ].map((tool) => [tool.name, tool]),
    );
    value.skillSettings.tools = value.skillSettings.tools.map((tool) => {
      const saved = savedTools.get(tool.name);
      return typeof saved?.autoCall === 'boolean'
        ? { ...tool, autoCall: saved.autoCall }
        : tool;
    });
    if (current) {
      await repository.update({
        filter: { username: options.username },
        values: value,
      });
      return;
    }
    await repository.create({ values: value });
  }

  private toEmployeeOptions(employee: AIEmployeeEntity): AIEmployeeOptions {
    return {
      username: employee.username,
      category: employee.category,
      description: employee.description,
      skills: [...(employee.skillSettings?.skills ?? [])],
      tools: [...(employee.skillSettings?.tools ?? [])],
      chatSettings: employee.chatSettings,
      avatar: employee.avatar,
      nickname: employee.nickname,
      position: employee.position,
      bio: employee.bio,
      greeting: employee.greeting,
      systemPrompt: employee.defaultPrompt,
      sort: employee.sort,
    };
  }

  private toBuiltInEmployee(
    options: AIEmployeeOptions,
    current?: AIEmployeeEntity,
  ): AIEmployeeEntity {
    if (!current) {
      return {
        username: options.username,
        category: options.category ?? 'business',
        nickname: options.nickname,
        position: options.position,
        avatar: options.avatar,
        bio: options.bio,
        greeting: options.greeting,
        about: null,
        description: options.description,
        defaultPrompt: options.systemPrompt,
        chatSettings: options.chatSettings,
        skillSettings: {
          skills: [...(options.skills ?? [])],
          tools: [...(options.tools ?? [])],
        },
        enableKnowledgeBase: false,
        knowledgeBase: DEFAULT_KNOWLEDGE_BASE,
        knowledgeBasePrompt: DEFAULT_KNOWLEDGE_BASE_PROMPT,
        enabled: true,
        builtIn: true,
        sort: options.sort,
      };
    }

    const preservedWorkflowTools = (current.skillSettings?.tools ?? []).filter(
      (tool) => tool.name?.startsWith('workflowCaller-'),
    );
    const mergedTools = new Map(
      [...preservedWorkflowTools, ...(options.tools ?? [])].map((tool) => [
        tool.name,
        tool,
      ]),
    );

    return {
      ...current,
      category: options.category ?? current.category,
      nickname: options.nickname ?? current.nickname,
      position: options.position ?? current.position,
      avatar: options.avatar ?? current.avatar,
      bio: options.bio ?? current.bio,
      greeting: options.greeting ?? current.greeting,
      description: options.description ?? current.description,
      defaultPrompt: options.systemPrompt,
      chatSettings: options.chatSettings ?? current.chatSettings,
      skillSettings: {
        skills: [...(options.skills ?? [])],
        tools: [...mergedTools.values()],
      },
      sort: options.sort,
    };
  }
}

export function defineAIEmployee(options: AIEmployeeOptions) {
  return options;
}
