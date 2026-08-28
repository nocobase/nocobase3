import { expect, test } from 'vitest';
import routes from '../client/routes.ts';
import {
  aiEmployeePath,
  aiSettingsPath,
  llmServicePath,
} from '../client/route-paths.ts';

test('client exposes authenticated AI settings routes', () => {
  expect(routes.map(({ name, path, auth }) => ({ name, path, auth }))).toEqual([
    { name: 'ai-settings-entry', path: aiSettingsPath, auth: 'required' },
    { name: 'ai-employee-management', path: aiEmployeePath, auth: 'required' },
    {
      name: 'ai-llm-service-management',
      path: llmServicePath,
      auth: 'required',
    },
  ]);
});
