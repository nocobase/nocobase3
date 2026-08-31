import type { SkillsEntity } from '../../repository/ai-skill.js';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { SkillsRepository } from '../../repository/ai-skill.js';
import type { SkillsManager, SkillsOptions, SkillsFilter } from './types.js';
import _ from 'lodash';

export class DefaultSkillsManager implements SkillsManager {
  constructor(private readonly repository: SkillsRepository) {}

  async getSkills(name: string[]): Promise<SkillsEntity[]>;
  async getSkills(name: string): Promise<SkillsEntity | undefined>;
  async getSkills(
    name: string | string[],
  ): Promise<SkillsEntity | SkillsEntity[] | undefined> {
    if (_.isArray(name)) {
      const entries = await Promise.all(
        name.map((skillName) => this.repository.getSkills(skillName)),
      );
      return entries.filter((entry): entry is SkillsEntity => Boolean(entry));
    }
    return await this.repository.getSkills(name);
  }

  async listSkills(filter: SkillsFilter = {}): Promise<SkillsEntity[]> {
    return await this.repository.listSkills(filter);
  }

  async registerSkills(options: SkillsOptions): Promise<void> {
    const current = await this.repository.getSkills(options.name);
    const value = {
      ...current,
      ...options,
      tools: options.tools ?? current?.tools ?? [],
      introduction: options.introduction ?? current?.introduction,
      from: options.from ?? current?.from ?? 'loader',
    };
    await this.repository.createOrUpdateSkills({ value });
  }

  async deleteSkills(name: string): Promise<void> {
    await this.repository.deleteSkills(name);
  }
}
