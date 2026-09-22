import type {
  AIMessageInput,
  AgentToolCallResult,
  UserDecision,
} from '@nocobase/ai-employee';
import type { ModelRef, Translate } from '../types.js';
import type { ConversationStreamTarget } from '../types.js';

/**
 * What one turn asks for. It is parsed from the request body exactly once and
 * is the only source `AgentState` is derived from, so nothing downstream reads
 * the body again or assembles a second copy of these fields.
 *
 * The session is not part of it. A turn arrives for a conversation, but the
 * conversation an agent runs in is the caller's to decide — a sub-agent runs in
 * its own — so it is named once, on `CreateEmployeeOptions`.
 */
export interface ConversationTurn {
  readonly messageId?: string;
  readonly messages?: readonly AIMessageInput[];
  /** The model this turn asks for. The employee's policy still decides. */
  readonly model?: ModelRef;
  readonly webSearch?: boolean;
  readonly important?: string;
  readonly frontendTools?: readonly unknown[];
  readonly toolCallResults?: readonly AgentToolCallResult[];
  readonly timezone?: string;
}

/**
 * How this turn's output reaches the caller, and how the caller cancels it.
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
