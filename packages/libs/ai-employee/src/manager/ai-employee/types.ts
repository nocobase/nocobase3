/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type {
  AIEmployeeEntity,
  AIEmployeeRepository,
  AIEmployeeToolSetting,
} from '../../repository/index.js';

export type AIEmployeeLocalizedProfile = {
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  about?: string;
};

export type AIEmployeeOptions = {
  username: string;
  category?: string;
  description?: string;
  skills?: string[];
  tools?: AIEmployeeToolSetting[];
  chatSettings?: AIEmployeeEntity['chatSettings'];
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  systemPrompt?: string | null;
  sort?: number;
};

export type AIEmployeeFilter = {
  builtIn?: boolean;
  username?: string;
};

export interface AIEmployeeManager {
  getEmployee(username: string): Promise<AIEmployeeEntity | undefined>;
  listEmployees(filter?: AIEmployeeFilter): Promise<AIEmployeeEntity[]>;
  registerEmployee(options: AIEmployeeOptions): Promise<void>;
  switchRepository(repository: AIEmployeeRepository): Promise<void>;
  upsertEmployee(entry: AIEmployeeEntity): Promise<AIEmployeeEntity>;
  deleteEmployee(username: string): Promise<void>;
}
