import { expect, test } from 'vitest';

import routes from '../client/routes.ts';
import {
  aiEmployeePath,
  aiSettingsPath,
  knowledgeBasePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

test('client exposes authenticated AI settings and employee routes', () => {
  expect(routes.map(({ name, path, auth }) => ({ name, path, auth }))).toEqual([
    { name: 'ai-settings-entry', path: aiSettingsPath, auth: 'required' },
    {
      name: 'ai-employee-management',
      path: aiEmployeePath,
      auth: 'required',
    },
  ]);
  expect(aiSettingsPath).toBe('/ai/settings');
  expect(aiEmployeePath).toBe('/ai/ai-employee');
  expect(knowledgeBasePath).toBe('/ai/knowledge-base');
  expect(vectorDatabasesPath).toBe('/ai/vector-database');
});
