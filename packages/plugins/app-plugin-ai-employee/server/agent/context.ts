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
import type { ConversationTurn } from './contracts.js';
import type { Actor, ModelRef, Translate } from '../types.js';

export interface CreateAgentContextOptions {
  readonly actor: Actor;
  readonly state?: Partial<AgentState>;
  readonly logger: Logger;
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
}

/**
 * Folds one turn into the agent state a tool sees. The session and the model
 * are not the turn's to give: an agent runs in the session its caller named,
 * and only the employee's policy may pick its model, so both arrive here
 * already decided. The result is handed to `createAgentContext` once, when the
 * AgentService is created; no later request may replace it.
 */
export function toAgentState(
  turn?: ConversationTurn,
  decided?: { sessionId?: string; model?: ModelRef },
): Partial<AgentState> {
  const model = decided?.model ?? turn?.model;
  return {
    sessionId: decided?.sessionId,
    messageId: turn?.messageId,
    handoffMessages: turn?.handoffMessages
      ? [...turn.handoffMessages]
      : undefined,
    model: model ? { ...model } : undefined,
    webSearch: turn?.webSearch,
    important: turn?.important,
    frontendTools: turn?.frontendTools ? [...turn.frontendTools] : undefined,
    toolCallResults: turn?.toolCallResults
      ? [...turn.toolCallResults]
      : undefined,
    timezone: turn?.timezone,
  };
}

/**
 * Builds the context every backend tool of this application starts from. It
 * carries what this execution is — who is asking, what the turn holds — and
 * nothing else: `deps` starts empty, and a tool that needs a manager,
 * repository or service declares its container token for `AgentService` to
 * resolve into `deps` for that tool alone.
 */
export function createAgentContext({
  actor,
  state: stateOverrides,
  logger,
  translate,
  getHeader,
}: CreateAgentContextOptions): AgentContext {
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
