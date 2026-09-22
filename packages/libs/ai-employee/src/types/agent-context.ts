import type { Logger } from '@nocobase/logging';
import type { AIMessageInput } from './ai-chat-conversation.type.js';
import type { SkillsEntity } from '../repository/ai-skill.js';

export interface AgentToolCallResult {
  id: string;
  result: unknown;
}

export interface AgentState {
  sessionId?: string;
  messageId?: string;
  /**
   * Messages an agent may hand to a sub-agent it dispatches. They are neither
   * the model's history, which the checkpointer holds, nor this call's input,
   * which the caller supplies per execution.
   */
  handoffMessages?: AIMessageInput[];
  /**
   * The model this execution resolved to. It is written by whoever creates the
   * agent, after the employee's own policy has decided, so a reader takes it as
   * given rather than narrowing it back out of loose data.
   */
  model?: { llmService: string; model: string };
  webSearch?: boolean;
  important?: string;
  frontendTools?: unknown[];
  toolCallResults?: AgentToolCallResult[];
  timezone?: string;
}

export interface AgentActor {
  id: string | number;
  roles: string[];
  isRoot: boolean;
  locale?: string;
}

/**
 * What a backend tool receives. It carries this execution's data plus the
 * dependencies the tool itself declared — nothing else. A tool that needs a
 * manager, repository or service declares its container token and reads it
 * from `deps`; there is no ambient handle to the database or the container.
 */
export interface AgentContext<TDeps = Record<string, never>> {
  deps: TDeps;
  actor: AgentActor;
  state: AgentState;
  logger: Logger;
  /** Host-owned authorization boundary for loading skill content. */
  availableSkills?: () => Promise<readonly SkillsEntity[]>;
  translate?: (key: string, options?: Record<string, unknown>) => string;
  /** Headers of the request this execution runs for, where one exists. */
  getHeader?: (name: string) => string | undefined;
}
