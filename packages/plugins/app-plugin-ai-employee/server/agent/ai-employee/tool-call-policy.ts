import type { ToolsEntity } from '@nocobase/ai-employee';

export interface ToolCallPolicy {
  getToolsMap(): Promise<ReadonlyMap<string, ToolsEntity>>;
  isAutoCall(
    tool: ToolsEntity | undefined,
    args: unknown,
  ): boolean | Promise<boolean>;
  shouldInterruptToolCall(tool?: ToolsEntity): boolean;
}
