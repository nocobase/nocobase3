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
import { managerFactoryToken } from '../../../factory/manager-factory.js';
import { repositoryFactoryToken } from '../../../factory/repository-factory.js';
import {
  getAccessibleAIEmployee,
  serializeEmployeeDetail,
} from '../../sub-agents/shared.js';

export default defineTools({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'Get AI employee',
    about: 'Get the detailed profile of an AI employee.',
  },
  definition: {
    name: 'get-ai-employee',
    description:
      'Get the detailed profile of one accessible AI employee by username.',
    schema: z.object({
      username: z.string().describe('The username of the AI employee.'),
    }),
  },
  dependencies: {
    repositories: repositoryFactoryToken,
    managers: managerFactoryToken,
  },
  async invoke(ctx, args) {
    const employee = await getAccessibleAIEmployee(ctx, args.username);
    if (!employee) {
      throw new Error(`AI employee "${args.username}" not found`);
    }

    return serializeEmployeeDetail(ctx, employee);
  },
});
