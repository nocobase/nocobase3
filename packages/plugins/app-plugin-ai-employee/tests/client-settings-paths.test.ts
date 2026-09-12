import { expect, test } from 'vitest';
import {
  aiEmployeePath,
  aiSettingsPath,
  knowledgeBasePath,
  llmServicePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

test('all AI tabs share the settings route', () => {
  expect([
    aiSettingsPath,
    aiEmployeePath,
    llmServicePath,
    knowledgeBasePath,
    vectorDatabasesPath,
  ]).toEqual([
    '/settings/ai',
    '/settings/ai',
    '/settings/ai',
    '/settings/ai',
    '/settings/ai',
  ]);
});
