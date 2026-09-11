import type { AgentThread } from '@nocobase/ai-employee';

export interface AgentThreadExecution {
  readonly thread?: AgentThread;
  readonly forked: boolean;
}
