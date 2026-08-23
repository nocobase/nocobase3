import { condition, run } from '@nocobase/app-plugin-workflow';

export const node: {
  condition: typeof condition;
  run: typeof run;
} = {
  condition,
  run,
};
export { defineWorkflow } from '@nocobase/app-plugin-workflow';
