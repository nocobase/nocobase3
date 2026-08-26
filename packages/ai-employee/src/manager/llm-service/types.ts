/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { LLMServiceEntity } from '../../repository/index.js';

export type LLMServiceOptions = {
  name: string;
  title?: string;
  provider: string;
  options?: Record<string, unknown>;
  enabledModels?: unknown;
  modelOptions?: Record<string, unknown>;
  builtIn?: boolean;
  enabled?: boolean;
  sort?: number;
};

export type LLMServiceQuery = {
  name?: string;
  provider?: string;
  enabled?: boolean;
};

export interface LLMServiceManager {
  getLLMService(name: string): Promise<LLMServiceEntity | undefined>;
  listLLMServices(query?: LLMServiceQuery): Promise<LLMServiceEntity[]>;
  registerLLMService(options: LLMServiceOptions): Promise<LLMServiceEntity>;
  deleteLLMService(name: string): Promise<void>;
}
