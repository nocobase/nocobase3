/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from '../../sub-agents/shared.js';
import {
  managerFactoryToken,
  repositoryFactoryToken,
} from '../../../tokens.js';

export default defineTools({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'List AI employees',
    about: 'Get the list of available AI employees.',
  },
  definition: {
    name: 'list-ai-employees',
    description:
      'List accessible AI employees with their basic profile and skill settings.',
    schema: z.object({}).describe('No input is required.'),
  },
  dependencies: {
    repositories: repositoryFactoryToken,
    managers: managerFactoryToken,
  },
  async invoke(ctx) {
    const employees = await listAccessibleAIEmployees(ctx);
    return {
      aiEmployees: employees.map((employee) =>
        serializeEmployeeSummary(ctx, employee),
      ),
    };
  },
});
