import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import enUS from '../client/locales/en-US.ts';
import zhCN from '../client/locales/zh-CN.ts';
import registryEnUS from '../registry/components/locales/en-US.ts';
import registryZhCN from '../registry/components/locales/zh-CN.ts';

const readClient = (relativePath: string): string =>
  fs.readFileSync(path.resolve('client', relativePath), 'utf8');

const readRegistry = (relativePath: string): string =>
  fs.readFileSync(path.resolve('registry', relativePath), 'utf8');

test('component translations use the registered plugin namespace', () => {
  for (const source of [
    readClient('components/i18n.ts'),
    readRegistry('components/i18n.ts'),
  ]) {
    expect(source).toMatch(/NOCOBASE_AI_KNOWLEDGE_BASE_I18N_NAMESPACE/);
    expect(source).not.toMatch(
      /const namespace = ['"]nocobase-ai-knowledge-base['"]/,
    );
  }
});

test('English source strings and Chinese translations cover requested knowledge-base UI', () => {
  const requestedKeys = [
    'Actions',
    'Created at',
    'Updated at',
    'Download',
    'Hit tests',
    'Input matching text',
    'Upload document',
    'No.',
    'Preview',
    'Related questions',
    'Edit segment',
    'Segment content',
    'Save changes',
    'Chunk overlap must be less than Chunk size.',
  ] as const;

  for (const resources of [
    [enUS, zhCN],
    [registryEnUS, registryZhCN],
  ] as const) {
    for (const key of requestedKeys) {
      expect(resources[0][key]).toBe(key);
      expect(resources[1][key]).toBeTruthy();
      expect(resources[1][key]).not.toBe(key);
    }
  }
});

test('retrieval details stay nested over the hit-test workspace and scroll independently', () => {
  const settings = readClient('settings-pages.tsx');
  const detail = readClient('page/retrieval-result-route.tsx');
  const registryDetail = readRegistry(
    'workspace/page/retrieval-result-route.tsx',
  );

  expect(settings).toMatch(
    /path='retrieval\/:resultIndex'[\s\S]*element=\{<RetrievalResultRouteEntry\s*\/>\}/,
  );
  expect(settings).not.toMatch(
    /path=\{`\$\{knowledgeBaseRoutePath\}\/:knowledgeBaseKey\/retrieval\/:resultIndex`\}/,
  );
  expect(detail).toMatch(/min-h-0 flex-1 overflow-y-auto p-5/);
  expect(registryDetail).toMatch(/min-h-0 flex-1 overflow-y-auto p-5/);
});

test('document downloads use the authenticated streaming endpoint', () => {
  for (const source of [
    readClient('page/knowledge-base-workspace-page.tsx'),
    readRegistry('workspace/page/knowledge-base-workspace-page.tsx'),
  ]) {
    expect(source).toMatch(
      /nocobaseClient\.stream\(\s*['"]aiKnowledgeBaseDocs:download['"]/,
    );
    expect(source).toMatch(/query: \{ filterByTk: downloadable\.id \}/);
    expect(source).toMatch(
      /URL\.createObjectURL\(await new Response\(stream\)\.blob\(\)\)/,
    );
    expect(source).not.toMatch(/resolveUrl\(downloadable\.url\)/);
  }
});

test('editor action bars remain fixed while form content scrolls', () => {
  for (const source of [
    readClient('page/knowledge-base-editor-sheet.tsx'),
    readRegistry('workspace/page/knowledge-base-editor-sheet.tsx'),
  ]) {
    expect(source).toMatch(/flex min-h-0 flex-1 flex-col overflow-hidden/);
    expect(source).toMatch(/min-h-0 flex-1 gap-5 overflow-y-auto/);
    expect(source).toMatch(/SheetFooter className='mt-0 shrink-0 border-t/);
  }

  for (const source of [
    readClient('page/segment-route.tsx'),
    readRegistry('workspace/page/segment-route.tsx'),
  ]) {
    expect(source).toMatch(/min-h-0 flex-1 space-y-4 overflow-y-auto/);
    expect(source).toMatch(/showSaveAction=\{false\}/);
    expect(source).toMatch(/flex shrink-0 justify-end gap-2 border-t/);
    expect(source).toMatch(/t\('Cancel'\)/);
  }
});

test('segment content editors keep a fixed height and scroll internally', () => {
  for (const source of [
    readClient('components/segments.tsx'),
    readRegistry('components/segments.tsx'),
  ]) {
    expect(source).toMatch(
      /h-64 min-h-64 max-h-64 resize-none overflow-y-auto field-sizing-fixed/,
    );
  }
});

test('vector database management uses row actions and spaced form fields', () => {
  const source = readClient('page/vector-databases-page.tsx');

  expect(source).not.toMatch(/type=['"]checkbox['"]/);
  expect(source).not.toMatch(/bulkDelete|selectedRows/);
  expect(source).toMatch(
    /onMouseEnter=\{\(\) => setProviderMenuOpen\(true\)\}/,
  );
  expect(source).toMatch(
    /<div className='grid gap-2'>[\s\S]*?<Label htmlFor='vector-spec'/,
  );
  expect(source).toMatch(/<div key=\{field\.key\} className='grid gap-2'>/);
});
