/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

const { getUploadConstraints } = vi.hoisted(() => ({
  getUploadConstraints: vi.fn(async () => ({
    acceptedExtensions: ['.pdf'],
    maxFileSizeBytes: 1024,
  })),
}));

vi.mock('../client/providers/context.js', () => {
  const service = { getUploadConstraints };
  return { useKnowledgeBaseService: () => service };
});

vi.mock('../client/components/i18n.js', () => ({
  useKnowledgeBaseComponentTranslate:
    () =>
    (key: string, options: Record<string, unknown> = {}) => {
      if (key === 'Choose one of the supported file types: {{types}}.') {
        return `Choose one of the supported file types: ${String(options.types)}.`;
      }
      return key;
    },
}));

import {
  DocumentDropzone,
  defaultDocumentExtensions,
} from '../client/components/upload.tsx';
import { useKnowledgeBaseDocument } from '../client/hooks/use-knowledge-base-document.ts';
import { SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS } from '../client/providers/types.ts';

test('the upload UI advertises exactly the eleven supported document extensions', () => {
  expect(defaultDocumentExtensions).toEqual([
    '.pdf',
    '.pptx',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.xlsm',
    '.txt',
    '.md',
    '.json',
    '.csv',
  ]);
  expect(defaultDocumentExtensions).toEqual(
    SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
  );
});

test('the file picker accepts uppercase supported extensions', () => {
  const onFileChange = vi.fn();
  const onFileRejected = vi.fn();
  const { container } = render(
    <DocumentDropzone
      onFileChange={onFileChange}
      onFileRejected={onFileRejected}
    />,
  );
  const input = container.querySelector('input[type="file"]');
  expect(input).not.toBeNull();
  expect(input?.getAttribute('accept')).toBe(
    SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS.join(','),
  );
  const file = new File(['content'], 'REPORT.PDF', {
    type: 'application/pdf',
  });

  fireEvent.change(input!, { target: { files: [file] } });

  expect(onFileRejected).toHaveBeenCalledWith('');
  expect(onFileChange).toHaveBeenCalledWith(file);
});

test('the file picker rejects ZIP with the same generic file-type validation', () => {
  const onFileChange = vi.fn();
  const onFileRejected = vi.fn();
  const { container } = render(
    <DocumentDropzone
      onFileChange={onFileChange}
      onFileRejected={onFileRejected}
    />,
  );
  const input = container.querySelector('input[type="file"]');
  const file = new File(['content'], 'archive.ZIP', {
    type: 'application/zip',
  });

  fireEvent.change(input!, { target: { files: [file] } });

  expect(onFileChange).toHaveBeenCalledWith(undefined);
  expect(onFileRejected).toHaveBeenCalledWith(
    `Choose one of the supported file types: ${SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS.join(
      ', ',
    )}.`,
  );
});

test('removed upload compatibility paths do not remain in client source', () => {
  const files = [
    '../client/components/upload.tsx',
    '../client/hooks/use-knowledge-base-document.ts',
    '../client/page/upload-controller.tsx',
    '../client/providers/service/knowledge-base-factory.ts',
    '../client/providers/service/knowledge-base.ts',
    '../client/providers/types.ts',
    '../client/locales/en-US.ts',
    '../client/locales/zh-CN.ts',
  ];
  const source = files
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');

  expect(source).not.toMatch(
    /zip|isAsyncUploadResult|taskId|presigned|putUrl|fileInfo|s3-compatible|finalize|method:\s*['"]PUT/iu,
  );
});

test('the document hook exposes upload constraints without ZIP encoding state', async () => {
  getUploadConstraints.mockClear();
  const { result } = renderHook(() =>
    useKnowledgeBaseDocument({
      knowledgeBaseKey: 'handbook',
      upload: { includeConstraints: true },
    }),
  );

  await waitFor(() =>
    expect(result.current.upload.constraints.loading).toBe(false),
  );

  expect(result.current.upload.constraints.data).toEqual({
    acceptedExtensions: ['.pdf'],
    maxFileSizeBytes: 1024,
  });
  expect(Object.keys(result.current.upload)).toEqual(['constraints']);
  expect(getUploadConstraints).toHaveBeenCalledTimes(1);
  expect(getUploadConstraints).toHaveBeenCalledWith({
    knowledgeBaseKey: 'handbook',
    signal: expect.any(AbortSignal),
  });
});
