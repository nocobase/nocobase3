/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Registry } from '../../utils/index.js';
import type {
  McpTool,
  McpToolResultPostProcessor,
  McpToolResultPostProcessorContext,
} from './types.js';
export class McpToolsManager {
  private tools = new Registry<McpTool>();
  private resultPostProcessors = new Map<
    string,
    McpToolResultPostProcessor[]
  >();

  private getActionKey(resourceName: string, actionName: string) {
    return `${resourceName}:${actionName}`;
  }

  registerTools(tools: McpTool[]) {
    for (const tool of tools) {
      this.tools.register(tool.name, tool);
    }
  }

  registerToolResultPostProcessor(
    resourceName: string,
    actionName: string,
    processor: McpToolResultPostProcessor,
  ) {
    const key = this.getActionKey(resourceName, actionName);
    const processors = this.resultPostProcessors.get(key) || [];
    processors.push(processor);
    this.resultPostProcessors.set(key, processors);
  }

  async postProcessToolResult(
    tool: McpTool,
    result: any,
    context: Omit<McpToolResultPostProcessorContext, 'tool'>,
  ) {
    if (!tool.resourceName || !tool.actionName) {
      return result;
    }

    const processors =
      this.resultPostProcessors.get(
        this.getActionKey(tool.resourceName, tool.actionName),
      ) || [];
    let current = result;

    for (const processor of processors) {
      current = await processor(current, {
        ...context,
        tool,
      });
    }

    return current;
  }

  listTools() {
    return [...this.tools.getValues()];
  }

  getTool(name: string) {
    return this.tools.get(name);
  }
}
