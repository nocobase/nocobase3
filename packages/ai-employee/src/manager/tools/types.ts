/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from '../../runtime/context.js';
import type {
  ToolsEntity,
  ToolsFrom,
  ToolsPermission,
  ToolsRuntime,
  ToolsScope,
} from '../../repository/tool.js';

export interface ToolsManager extends ToolsRegistration {
  getTools(
    toolName: string,
    filter?: ToolsFilter,
  ): Promise<ToolsEntity | undefined>;
  listTools(filter?: ToolsFilter): Promise<ToolsEntity[]>;
  isToolsExisted(toolName: string): Promise<boolean>;
  unregisterTools(toolName: string | string[]): Promise<number>;
}

export interface ToolsRegistration {
  registerTools(options: ToolsOptions | ToolsOptions[]): Promise<void>;
  registerDynamicTools(provider: DynamicToolsProvider): void;
}

export type ToolsOptions = ToolsEntity & {
  scope: Scope;
  from?: From;
  execution?: 'frontend' | 'backend';
  defaultPermission?: Permission;
  silence?: boolean;
  introduction?: {
    title: string;
    about?: string;
  };
  definition: {
    name: string;
    description: string;
    schema?: any;
  };
  invoke: (ctx: Context, args: any, runtime: ToolsRuntime) => Promise<any>;
};

export type Scope = ToolsScope;
export type Permission = ToolsPermission;
export type From = ToolsFrom;
export type { ToolsRuntime };
export type DynamicToolsProvider = (
  register: ToolsRegistration,
  filter?: ToolsFilter,
) => Promise<void>;

export type ToolsFilter = {
  scope?: Scope;
  defaultPermission?: Permission;
  silence?: boolean;
  sessionId?: string;
  ctx?: Context;
};
