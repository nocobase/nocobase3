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
  /**
   * Messages to hand to a sub-agent whose pending tool call this turn
   * interrupted, and nothing else. They are neither the model's history, which
   * the checkpointer holds, nor this call's input, which is
   * `AgentRequest.userMessages`.
   *
   * One flow sets them. When a user ignores a sub-agent's pending tool call and
   * sends a new message, the main agent is resumed with the tool decisions
   * alone, so that message never enters the main graph at all. It reaches
   * `dispatch-sub-agent-task` through the agent state instead, which hands it
   * to the sub-agent as `appendMessages`. The message is answering the
   * sub-agent's pending question, so it belongs to that conversation and is
   * persisted there rather than in the main one. Every other turn leaves this
   * empty.
   */
  readonly handoffMessages?: readonly AIMessageInput[];
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
