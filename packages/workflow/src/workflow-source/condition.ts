import { ConditionInstruction } from '../server/instructions/condition.js';

export const condition: typeof ConditionInstruction.create = ConditionInstruction.create.bind(ConditionInstruction);
export type { ConditionConfig } from '../server/instructions/condition.js';
export type { JsonLogicExpression } from '../server/expressions/index.js';
