import { condition, run } from '@nocobase/workflow/workflow-source';
import { custom } from '@nocobase/workflow/workflow-source/triggers';

export const node: { condition: typeof condition; run: typeof run } = { condition, run };
export const trigger: { custom: typeof custom } = { custom };
export { defineWorkflow } from '@nocobase/workflow/workflow-source';
