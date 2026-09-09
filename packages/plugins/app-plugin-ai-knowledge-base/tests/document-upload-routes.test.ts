import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES } from '../server/document-upload.js';
import { createDocumentRoutes } from '../server/routes/documents.js';
import type { KnowledgeBaseDocumentService } from '../server/services/knowledge-base-document-service.js';

function setup() {
  const upload = vi.fn().mockResolvedValue({
    id: 7,
    filename: 'report.pdf',
    indexStatus: 'PENDING',
  });
  const open = vi.fn();
  const service = {
    upload,
    open,
  } as unknown as KnowledgeBaseDocumentService;
  return { routes: createDocumentRoutes({ service }), upload, open, service };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('document download route protocol', () => {
  it('streams stored document content as an attachment', async () => {
    const { routes, open } = setup();
    open.mockResolvedValue({
      metadata: { filename: '质量报告.txt' },
      contentType: 'text/plain',
      stream: Readable.from([Buffer.from('document body')]),
    });

    const response = await routes.request(
      '/aiKnowledgeBaseDocs:download?filterByTk=7',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''%E8%B4%A8%E9%87%8F%E6%8A%A5%E5%91%8A.txt",
    );
    await expect(response.text()).resolves.toBe('document body');
    expect(open).toHaveBeenCalledWith('7');
  });

  it('returns 404 when the document no longer exists', async () => {
    const { routes, open } = setup();
    open.mockResolvedValue(null);

    const response = await routes.request(
      '/aiKnowledgeBaseDocs:download?filterByTk=missing',
    );

    expect(response.status).toBe(404);
  });
});

describe('document upload route protocol', () => {
  it('uploads multipart with knowledgeBaseKey from the query', async () => {
    const { routes, upload } = setup();
    const form = new FormData();
    form.set('knowledgeBaseKey', 'ignored-form-key');
    form.set(
      'file',
      new File(['pdf'], 'REPORT.PDF', { type: 'application/pdf' }),
    );
    const response = await routes.request(
      '/aiKnowledgeBaseDocs:upload?knowledgeBaseKey=query-key',
      { method: 'POST', body: form },
    );
    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBaseKey: 'query-key',
        file: expect.objectContaining({ name: 'REPORT.PDF', size: 3 }),
      }),
    );
    await expect(responseBody(response)).resolves.toEqual({
      data: { id: 7, filename: 'report.pdf', indexStatus: 'PENDING' },
    });
  });

  it('uploads multipart with knowledgeBaseKey from the form', async () => {
    const { routes, upload } = setup();
    const form = new FormData();
    form.set('knowledgeBaseKey', 'form-key');
    form.set('file', new File(['text'], 'notes.md'));
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeBaseKey: 'form-key' }),
    );
  });

  it.each([
    ['empty', ''],
    ['whitespace', '%20%20%20'],
  ])(
    'falls back to the form key when the query key is %s',
    async (_name, queryKey) => {
      const { routes, upload } = setup();
      const form = new FormData();
      form.set('knowledgeBaseKey', 'form-key');
      form.set('file', new File(['text'], 'notes.md'));
      const response = await routes.request(
        `/aiKnowledgeBaseDocs:upload?knowledgeBaseKey=${queryKey}`,
        { method: 'POST', body: form },
      );

      expect(response.status).toBe(200);
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeBaseKey: 'form-key' }),
      );
    },
  );

  it('rejects blank query and form keys', async () => {
    const { routes, upload } = setup();
    const form = new FormData();
    form.set('knowledgeBaseKey', '   ');
    form.set('file', new File(['text'], 'notes.md'));
    const response = await routes.request(
      '/aiKnowledgeBaseDocs:upload?knowledgeBaseKey=%20%20',
      { method: 'POST', body: form },
    );

    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UPLOAD_INPUT_INVALID',
    });
    expect(upload).not.toHaveBeenCalled();
  });
  it.each([
    ['application/json', JSON.stringify({ knowledgeBaseKey: 'kb' })],
    ['text/plain', 'plain'],
    ['', ''],
  ])(
    'rejects unsupported content type %s with 415',
    async (contentType, body) => {
      const { routes, upload } = setup();
      const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
        method: 'POST',
        ...(contentType ? { headers: { 'content-type': contentType } } : {}),
        ...(body ? { body } : {}),
      });
      expect(response.status).toBe(415);
      await expect(responseBody(response)).resolves.toMatchObject({
        code: 'UNSUPPORTED_UPLOAD_CONTENT_TYPE',
        message: 'Document upload requires multipart/form-data.',
      });
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it('rejects multipart without a boundary with 415', async () => {
    const { routes } = setup();
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: 'invalid',
    });
    expect(response.status).toBe(415);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UNSUPPORTED_UPLOAD_CONTENT_TYPE',
    });
  });

  it('rejects an invalid multipart body with 400', async () => {
    const { routes, upload } = setup();
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=broken' },
      body: '--not-the-declared-boundary--',
    });
    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UPLOAD_INPUT_INVALID',
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['missing key', new File(['pdf'], 'report.pdf'), ''],
    ['missing file', null, 'kb'],
  ])('rejects %s with 400', async (_name, file, knowledgeBaseKey) => {
    const { routes, upload } = setup();
    const form = new FormData();
    if (knowledgeBaseKey) form.set('knowledgeBaseKey', knowledgeBaseKey);
    if (file) form.set('file', file);
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UPLOAD_INPUT_INVALID',
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects multiple files with 400', async () => {
    const { routes, upload } = setup();
    const form = new FormData();
    form.set('knowledgeBaseKey', 'kb');
    form.append('file', new File(['a'], 'a.pdf'));
    form.append('file', new File(['b'], 'b.pdf'));
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a valid file plus a file under another field name', async () => {
    const { routes, upload } = setup();
    const form = new FormData();
    form.set('knowledgeBaseKey', 'kb');
    form.set('file', new File(['a'], 'a.pdf'));
    form.set('ignored', new File(['b'], 'b.pdf'));
    const response = await routes.request('/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UPLOAD_INPUT_INVALID',
    });
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects file.size before reading the file body', async () => {
    const { routes, upload } = setup();
    const arrayBuffer = vi.fn();
    const largeFile = {
      name: 'large.pdf',
      type: 'application/pdf',
      size: MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES + 1,
      arrayBuffer,
    };
    const formData = vi.fn().mockResolvedValue({
      entries: () =>
        [
          ['knowledgeBaseKey', 'kb'],
          ['file', largeFile],
        ][Symbol.iterator](),
      get: (name: string) => (name === 'knowledgeBaseKey' ? 'kb' : null),
    });
    const request = new Request('http://localhost/aiKnowledgeBaseDocs:upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
    });
    Object.defineProperty(request, 'formData', { value: formData });
    const response = await routes.fetch(request);
    expect(response.status).toBe(413);
    await expect(responseBody(response)).resolves.toMatchObject({
      code: 'UPLOAD_TOO_LARGE',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not expose the removed ZIP encoding route', async () => {
    const { routes } = setup();
    const response = await routes.request(
      '/aiKnowledgeBaseDocs:getZipFilenameEncodingOptions',
    );
    expect(response.status).toBe(404);
  });
});
