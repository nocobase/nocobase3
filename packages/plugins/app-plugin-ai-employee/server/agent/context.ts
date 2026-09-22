/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type {
  AgentContext,
  AgentRuntime,
  AgentState,
} from '@nocobase/ai-employee';
import type { Actor } from '../types.js';

export interface CreateAgentContextOptions {
  readonly actor: Actor;
  readonly state: AgentState;
  readonly runtime: AgentRuntime;
}

/** `deps` starts empty; `AgentService` fills each tool's own when it builds it. */
export function createAgentContext({
  actor,
  state,
  runtime,
}: CreateAgentContextOptions): AgentContext {
  return {
    deps: {},
    actor: {
      id: actor.id,
      roles: [...actor.roles],
      isRoot: actor.isRoot,
      locale: actor.locale,
    },
    state: { ...state },
    runtime,
  };
}
