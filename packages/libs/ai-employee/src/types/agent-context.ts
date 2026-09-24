import type { Logger } from '@nocobase/logging';
import type { AIMessageInput } from './ai-chat-conversation.type.js';
import type { SkillsEntity } from '../repository/ai-skill.js';

export interface AgentToolCallResult {
  id: string;
  result: unknown;
}

/**
 * What one execution is, as every backend tool of it sees it. Built where the
 * request is parsed; only `model` and `sessionId` are replaced afterwards.
 */
export interface AgentState {
  sessionId: string;
  messageId?: string;
  /**
   * Messages an agent may hand to a sub-agent it dispatches. Not history — the
   * checkpointer holds that — and not this call's input.
   */
  handoffMessages?: AIMessageInput[];
  /** Already resolved against the employee's policy; read it as given. */
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
 * What the host lends an execution while it runs. None of it describes the
 * execution, which is why it is not part of the state.
 */
export interface AgentRuntime {
  logger: Logger;
  translate?: (key: string, options?: Record<string, unknown>) => string;
  /** Absent where the execution serves no request. */
  getHeader?: (name: string) => string | undefined;
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
  runtime: AgentRuntime;
  /** Host-owned authorization boundary for loading skill content. */
  availableSkills?: () => Promise<readonly SkillsEntity[]>;
}
