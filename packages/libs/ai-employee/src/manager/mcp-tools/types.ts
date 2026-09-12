/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type McpTool = {
  name: string;
  description: string;
  inputSchema?: any;
  resourceName?: string;
  actionName?: string;
  path?: string;
  method?: string;
  call: (
    args: Record<string, any>,
    context?: McpToolCallContext,
  ) => Promise<any>;
};

export type McpToolCallContext = {
  token?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export type McpToolResultPostProcessorContext = {
  tool: McpTool;
  args: Record<string, any>;
  callContext?: McpToolCallContext;
  response?: {
    statusCode?: number;
    headers?: Record<string, any>;
    body?: any;
  };
};

export type McpToolResultPostProcessor = (
  result: any,
  context: McpToolResultPostProcessorContext,
) => any | Promise<any>;
