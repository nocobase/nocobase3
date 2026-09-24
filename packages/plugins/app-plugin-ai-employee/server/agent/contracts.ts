import type { UserDecision } from '@nocobase/ai-employee';
import type { Translate } from '../types.js';
import type { ConversationStreamTarget } from '../types.js';

/**
 * How one execution's output reaches the caller, and how the caller cancels it.
 * It stops at the conversation service: an agent never sees a stream target.
 */
export interface ConversationTransport {
  readonly streamTarget?: ConversationStreamTarget;
  readonly abortSignal?: AbortSignal;
  readonly translate: Translate;
  readonly getHeader?: (name: string) => string | undefined;
}

export interface AgentUserDecisionResult {
  interruptId?: string;
  decisions: UserDecision[];
}
