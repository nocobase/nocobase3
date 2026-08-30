/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  defineTools,
  type AgentContext,
  type AIEmployeeRepository,
} from '@nocobase/ai-employee';
import type { AgentBuiltInService } from '../../../server/agent/contracts.js';
import { z } from 'zod';
import {
  getAccessibleAIEmployee,
  serializeEmployeeDetail,
} from '../../sub-agents/shared.js';
import { AI_EMPLOYEE_I18N_NAMESPACE } from '../../../namespace.js';

type AIEmployeeContext = AgentContext<
  { aiEmployees: AIEmployeeRepository },
  { builtIn: AgentBuiltInService }
>;

export default defineTools<AIEmployeeContext>({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  introduction: {
    title: `{{t("Get AI employee", { ns: "${AI_EMPLOYEE_I18N_NAMESPACE}" })}}`,
    about: `{{t("Get the detailed definition of AI employee", { ns: "${AI_EMPLOYEE_I18N_NAMESPACE}" })}}`,
  },
  definition: {
    name: 'get-ai-employee',
    description:
      'Get the detailed profile of one accessible AI employee by username.',
    schema: z.object({
      username: z.string().describe('The username of the AI employee.'),
    }),
  },
  async invoke(ctx, args) {
    const employee = await getAccessibleAIEmployee(ctx, args.username);
    if (!employee) {
      throw new Error(`AI employee "${args.username}" not found`);
    }

    return serializeEmployeeDetail(ctx, employee);
  },
});
