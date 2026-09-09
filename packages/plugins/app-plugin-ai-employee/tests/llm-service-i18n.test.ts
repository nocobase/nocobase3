import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import enUS from '../client/locales/en-US.ts';
import zhCN from '../client/locales/zh-CN.ts';

const source = fs.readFileSync(
  path.resolve('client/pages/llm-service-page.tsx'),
  'utf8',
);

const llmServiceKeys = [
  'UID',
  'Title',
  'Provider',
  'Models',
  'Enabled',
  'Embedding',
  'LLM',
  'Enable {{name}}',
  'Edit models',
  'Edit models for {{name}}',
  'No models',
  'Search provider models',
  'Search models',
  'Loading…',
  'Configure LLM models. Embedding models do not need to be added.',
  'Select models',
  'Select models to enable',
  'Remove',
  'Manual input',
  'Model ID',
  'Model label',
  'Display name',
  'Remove model {{number}}',
  'Add model',
  'Cancel',
  'Submit',
] as const;

test('LLM service table and editor use the plugin translation hook', () => {
  expect(source).toMatch(/const t = useT\(\)/);
  expect(source).not.toMatch(
    />\s*(?:Title|Provider|Models|Enabled|No models|Edit models|Manual input|Add model|Submit)\s*</,
  );
  expect(source).not.toMatch(
    /(?:aria-label|placeholder|title)=['"](?:Edit models|Search provider models|Search models|Model ID|Model label|Display name)['"]/,
  );
});

test('LLM service translations cover English and Chinese', () => {
  for (const key of llmServiceKeys) {
    expect(enUS[key]).toBe(key);
    expect(zhCN[key]).toBeTruthy();
    expect(zhCN[key]).not.toBe(key);
  }
});
