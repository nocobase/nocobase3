/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';

export default defineTools<AgentContext<{}, {}>>({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'Load skill',
    about: 'Load the content and related tools for a specified skill.',
  },
  definition: {
    name: 'getSkill',
    description: 'Get the content and related tools for a specified skill.',
    schema: z.object({
      skillName: z.string().describe('Name of skill to load'),
    }),
  },
  invoke: async (ctx, args) => {
    // Discovery and persisted activation are not authorization grants. Require
    // the host's current visibility policy even for a direct tool invocation.
    const target = (await ctx.availableSkills?.())?.find(
      (skill) => skill.name === args.skillName,
    );
    if (!target) {
      return {
        status: 'error',
        content: {
          message: 'Skill not found',
        },
      };
    }

    return {
      status: 'success',
      content: {
        skillName: target.name,
        skillContent: target.content,
        activatedTools: target.tools,
      },
    };
  },
});
