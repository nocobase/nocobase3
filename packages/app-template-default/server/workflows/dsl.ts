import { condition, run } from '@nocobase/workflow';

export const node: {
  condition: typeof condition;
  run: typeof run;
} = {
  condition,
  run,
};
export { defineWorkflow } from '@nocobase/workflow';
