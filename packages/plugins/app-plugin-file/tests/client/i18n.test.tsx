import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadField } from '../../client/components/file-upload-field.js';
import clientLocales from '../../client/locales/index.js';
import filePlugin from '../../client/plugin.js';
import type { FilesClient } from '../../client/types.js';
import { createFileI18nRuntime, TEST_APP_NS } from '../i18n.js';

const client: FilesClient = {
  list: vi.fn().mockResolvedValue([]),
  upload: vi.fn(),
  get: vi.fn(),
  createAccessUrl: vi.fn(),
  remove: vi.fn(),
};

describe('file plugin Client i18n', () => {
  it('declares lazy English and Chinese resources', () => {
    expect(filePlugin().locales).toMatchObject({
      'en-US': expect.any(Function),
      'zh-CN': expect.any(Function),
    });
  });

  it.each([
    ['en-US', 'Choose file'],
    ['zh-CN', '选择文件'],
  ] as const)(
    'renders a public component in %s with its explicit plugin namespace',
    async (locale, label) => {
      const runtime = await createFileI18nRuntime(clientLocales, locale);

      render(
        <I18nProvider runtime={runtime}>
          <NamespaceScope ns={TEST_APP_NS}>
            <FileUploadField client={client} value={[]} onChange={vi.fn()} />
          </NamespaceScope>
        </I18nProvider>,
      );

      expect(screen.getByRole('button', { name: label })).toBeVisible();
      expect(screen.getByLabelText(label)).toBeVisible();
    },
  );
});
