import { getRequestTranslator } from '@nocobase/i18n/server';
import type { Context } from 'hono';

import { WORKFLOW_NS } from '../shared/namespace.js';

export function translateWorkflowMessage(
  context: Context,
  key: string,
  defaultValue: string,
): string {
  return getRequestTranslator(context, WORKFLOW_NS)(key, { defaultValue });
}
