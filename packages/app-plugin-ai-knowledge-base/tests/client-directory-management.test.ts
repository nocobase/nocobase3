import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const livePage = fs.readFileSync(
  path.resolve('client/live/knowledge-bases-page.tsx'),
  'utf8',
);
const cardComponents = fs.readFileSync(
  path.resolve('client/components/knowledge-bases.tsx'),
  'utf8',
);
const editor = fs.readFileSync(
  path.resolve('client/live/knowledge-base-editor-sheet.tsx'),
  'utf8',
);

test('directory is a fixed card layout with create, menu, and enabled controls', () => {
  expect(livePage).toMatch(/<KnowledgeBaseCardGrid/);
  expect(livePage).not.toMatch(
    /KnowledgeBaseSwitchableDirectory|KnowledgeBaseList/,
  );
  expect(livePage).not.toMatch(/Search knowledge bases|onQueryChange|view=/);
  expect(livePage).toMatch(/New knowledge base/);
  expect(livePage).toMatch(/<Ellipsis/);
  expect(livePage).toMatch(/variant=['"]destructive['"]/);
  expect(livePage).toMatch(/Settings/);
  expect(livePage).toMatch(/renderEnabledControl/);
  expect(cardComponents).toMatch(/absolute top-3 right-3/);
});

test('create and settings use a right-side half-width sheet', () => {
  expect(editor).toMatch(/<SheetContent[\s\S]*side=['"]right['"]/);
  expect(editor).toMatch(/md:w-1\/2/);
  expect(editor).toMatch(/createKnowledgeBase/);
  expect(editor).toMatch(/updateKnowledgeBase/);
  expect(editor).toMatch(/listKnowledgeBaseManagementOptions/);
});
