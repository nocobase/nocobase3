import { RunInstruction } from '../server/instructions/run.js';

export const run: typeof RunInstruction.create = RunInstruction.create.bind(RunInstruction);
export type { RunConfig } from '../server/instructions/run.js';
