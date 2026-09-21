/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AgentContext, AgentState } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';
import type { ConversationExecution } from './contracts.js';
import type { Actor, Translate } from '../types.js';

/**
 * The context every backend tool of this application starts from. It carries
 * what this execution is — who is asking, what the turn holds — and nothing
 * else. A tool that needs a manager, repository or service declares its
 * container token, and `AgentService` resolves it into `deps` for that tool
 * alone.
 */
export type AppAgentContext = AgentContext;

export interface CreateAgentContextOptions {
  readonly actor: Actor;
  readonly state?: Partial<AgentState>;
  readonly logger: Logger;
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
}

/**
 * Folds one request's execution details into the agent state. The result is
 * handed to `createAgentContext` once, when the AgentService is created; no
 * later call may replace it.
 */
export function toAgentState(
  execution?: ConversationExecution,
  overrides?: Partial<AgentState>,
): Partial<AgentState> {
  return {
    sessionId: execution?.sessionId,
    messageId: execution?.messageId,
    messages: execution?.messages ? [...execution.messages] : undefined,
    model: execution?.model ? { ...execution.model } : undefined,
    webSearch: execution?.webSearch,
    important: execution?.important,
    frontendTools: execution?.frontendTools
      ? [...execution.frontendTools]
      : undefined,
    toolCallResults: execution?.toolCallResults
      ? [...execution.toolCallResults]
      : undefined,
    timezone: execution?.timezone,
    ...overrides,
  };
}

export function createAgentContext({
  actor,
  state: stateOverrides,
  logger,
  translate,
  getHeader,
}: CreateAgentContextOptions): AppAgentContext {
  return {
    deps: {},
    actor: {
      id: actor.id,
      roles: [...actor.roles],
      isRoot: actor.isRoot,
      locale: actor.locale,
    },
    state: { ...stateOverrides },
    logger,
    translate,
    getHeader,
  };
}
