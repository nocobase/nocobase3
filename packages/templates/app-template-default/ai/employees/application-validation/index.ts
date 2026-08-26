import { defineAIEmployee } from '@nocobase/ai-employee';

/** Application-owned fixture that proves application resources extend builtins. */
export default defineAIEmployee({
  username: 'application-validation',
  category: 'developer',
  nickname: 'Application validation',
  position: 'Resource loading verifier',
  description:
    'Validates application AI resource loading after package builtins.',
  systemPrompt:
    'Confirm that this application-specific AI employee was loaded after package builtins.',
  skills: ['application-validation'],
  tools: [{ name: 'application-validation', autoCall: true }],
});
