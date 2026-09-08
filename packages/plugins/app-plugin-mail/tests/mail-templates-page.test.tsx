import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../client/locales/index.js';

const mail = vi.hoisted(() => ({
  deleteTemplate: vi.fn(),
  listTemplates: vi.fn(),
  saveTemplate: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({ getMailClient: () => mail }));

import MailTemplatesPage from '../client/pages/mail-templates-page.js';

const namespace = '@nocobase/app-plugin-mail';

describe('MailTemplatesPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listTemplates.mockResolvedValue([]);
    mail.saveTemplate.mockResolvedValue({
      id: 'template-1',
      name: 'Follow up',
      subject: 'Next steps',
      text: 'Hello',
      html: '',
      scope: 'private',
      ownerId: 'user-1',
    });
    mail.deleteTemplate.mockResolvedValue(undefined);
  });

  it('creates, edits, deletes, and reports template failures', async () => {
    mail.listTemplates.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: 'template-1',
        name: 'Follow up',
        subject: 'Next steps',
        text: 'Hello',
        html: '',
        scope: 'private',
        ownerId: 'user-1',
      },
    ]);
    await renderPage('en-US');

    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Follow up' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Next steps' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(mail.saveTemplate).toHaveBeenCalledWith({
        name: 'Follow up',
        subject: 'Next steps',
        text: '',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Follow up/ }));
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Updated next steps' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(mail.saveTemplate).toHaveBeenLastCalledWith({
        id: 'template-1',
        name: 'Follow up',
        subject: 'Updated next steps',
        text: 'Hello',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Follow up/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(mail.deleteTemplate).toHaveBeenCalledWith('template-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Broken' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Failure' },
    });
    mail.saveTemplate.mockRejectedValueOnce(
      new Error('Template service failed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(
      await screen.findByText('Template service failed'),
    ).toBeInTheDocument();
  });

  it('renders the Chinese template interface', async () => {
    await renderPage('zh-CN');
    expect(screen.getByRole('heading', { name: '邮件模板' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新建模板' })).toBeVisible();
    expect(screen.getByLabelText('模板名称')).toBeVisible();
  });
});

async function renderPage(locale: 'en-US' | 'zh-CN'): Promise<void> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: '@nocobase/app-plugin-mail-test-app',
  });
  runtime.registerNamespace(namespace, locales);
  await runtime.init(locale);
  render(
    <I18nProvider runtime={runtime}>
      <NamespaceScope ns={namespace}>
        <MailTemplatesPage />
      </NamespaceScope>
    </I18nProvider>,
  );
  await waitFor(() => expect(mail.listTemplates).toHaveBeenCalled());
}
