import type {
  AIMessageInput,
  AgentToolCallResult,
  UserDecision,
} from '@nocobase/ai-employee';
import type { ModelRef } from '../types.js';
import type { ConversationStreamTarget } from '../types.js';

export interface ConversationExecution {
  readonly sessionId?: string;
  readonly messageId?: string;
  readonly messages?: readonly AIMessageInput[];
  readonly model?: ModelRef;
  readonly webSearch?: boolean;
  readonly important?: string;
  readonly frontendTools?: readonly unknown[];
  readonly toolCallResults?: readonly AgentToolCallResult[];
  readonly streamTarget?: ConversationStreamTarget;
  readonly abortSignal?: AbortSignal;
  readonly timezone?: string;
}

export interface AgentUserDecisionResult {
  interruptId?: string;
  decisions: UserDecision[];
}
