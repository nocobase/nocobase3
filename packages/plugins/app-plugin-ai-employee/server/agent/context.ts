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
import type { Actor, Translate } from '../types.js';

export interface CreateAgentContextOptions {
  readonly actor: Actor;
  readonly state: AgentState;
  readonly logger: Logger;
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
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
  state,
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
    state: { ...state },
    logger,
    translate,
    getHeader,
  };
}
