import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import locales from '../client/locales/index.js';
import { MAIL_PLUGIN_NS } from '../client/namespace.js';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mail = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listProviders: vi.fn(),
  listIdentities: vi.fn(),
  listSignatures: vi.fn(),
  listTemplates: vi.fn(),
  sendMessage: vi.fn(),
  sendBulk: vi.fn(),
  downloadAttachment: vi.fn(),
  saveDraft: vi.fn(),
  uploadAttachment: vi.fn(),
}));
vi.mock('../client/runtime.js', () => ({ useMailClient: () => mail }));
import MailSendPage from '../client/pages/mail-send-page.js';

describe('MailSendPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account',
        provider: { type: 'gmail', name: 'google' },
        status: 'active',
        address: 'sender@example.com',
      },
    ]);
    mail.listProviders.mockResolvedValue([
      {
        type: 'gmail',
        name: 'google',
        capabilities: { send: true, drafts: true },
      },
    ]);
    mail.listIdentities.mockResolvedValue([
      {
        id: 'sender',
        address: 'sender@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
    mail.listSignatures.mockResolvedValue([]);
    mail.listTemplates.mockResolvedValue([]);
    mail.sendMessage.mockResolvedValue({ status: 'accepted' });
    mail.sendBulk.mockResolvedValue([
      { status: 'pending' },
      { status: 'pending' },
    ]);
    mail.saveDraft.mockResolvedValue({ id: 'draft', attachments: [] });
    mail.uploadAttachment.mockResolvedValue({
      id: 'upload',
      fileName: 'notes.txt',
      size: 4,
    });
  });
  function mockMultipleAccounts(): void {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account',
        provider: { type: 'gmail', name: 'google' },
        status: 'active',
        address: 'sender@example.com',
      },
      {
        id: 'other',
        provider: { type: 'gmail', name: 'google' },
        status: 'active',
        address: 'other@example.com',
      },
    ]);
    mail.listIdentities.mockImplementation((id: string) =>
      Promise.resolve([
        {
          id: `${id}-identity`,
          address: `${id}@example.com`,
          isPrimary: true,
          canSend: true,
        },
      ]),
    );
  }

  it('selects sender addresses directly and preserves each account message and attachments', async () => {
    mockMultipleAccounts();
    render(<MailSendPage />);
    await screen.findByLabelText('TO');
    expect(
      screen.queryByRole('combobox', { name: 'Account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'From address' }),
    ).toBeEnabled();
    const first = screen.getByRole('region', { name: 'New message' });
    fireEvent.change(within(first).getByLabelText('TO'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(within(first).getByLabelText('Subject'), {
      target: { value: 'First account draft' },
    });
    const body = within(first).getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>First account body</p>';
    fireEvent.input(body);
    fireEvent.change(first.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      },
    });
    await within(first).findByText('notes.txt');

    fireEvent.change(screen.getByRole('combobox', { name: 'From address' }), {
      target: { value: JSON.stringify(['other', 'other-identity']) },
    });
    const second = screen.getByRole('region', { name: 'New message' });
    expect(second).not.toBe(first);
    fireEvent.click(
      within(second).getByRole('checkbox', { name: 'Schedule send' }),
    );
    const schedule = within(second).getByLabelText('Send later (optional)');
    expect(second).toContainElement(schedule);
    fireEvent.change(schedule, { target: { value: '2099-01-01T10:00' } });
    expect(first).not.toBeVisible();
    expect(within(second).getByLabelText('Subject')).toHaveValue('');
    expect(within(second).queryByText('notes.txt')).not.toBeInTheDocument();
    fireEvent.change(within(second).getByLabelText('Subject'), {
      target: { value: 'Other account draft' },
    });
    await waitFor(() =>
      expect(mail.listIdentities).toHaveBeenCalledWith('other'),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'From address' }), {
      target: { value: JSON.stringify(['account', 'account-identity']) },
    });
    expect(first).toBeVisible();
    expect(within(first).getByLabelText('TO')).toHaveValue('alice@example.com');
    expect(within(first).getByLabelText('Subject')).toHaveValue(
      'First account draft',
    );
    expect(
      within(first).getByRole('textbox', { name: 'Message body' }),
    ).toHaveTextContent('First account body');
    expect(within(first).getByText('notes.txt')).toBeVisible();
    fireEvent.click(within(first).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account',
          identityId: 'account-identity',
          subject: 'First account draft',
          attachmentIds: ['upload'],
        }),
      ),
    );
    await waitFor(() => expect(first).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox', { name: 'From address' }), {
      target: { value: JSON.stringify(['other', 'other-identity']) },
    });
    expect(second).toBeVisible();
    expect(within(second).getByLabelText('Subject')).toHaveValue(
      'Other account draft',
    );
  });

  it('keeps the selected composer open when sending finishes for another account', async () => {
    mockMultipleAccounts();
    let finishSend!: (value: { status: string }) => void;
    mail.sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSend = resolve;
        }),
    );
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'First account draft' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Body</p>';
    fireEvent.input(body);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'From address' }), {
      target: { value: JSON.stringify(['other', 'other-identity']) },
    });
    const second = screen.getByRole('region', { name: 'New message' });
    fireEvent.change(within(second).getByLabelText('Subject'), {
      target: { value: 'Keep editing' },
    });
    finishSend({ status: 'accepted' });
    await waitFor(() => expect(mail.listIdentities).toHaveBeenCalledTimes(5));
    expect(second).toBeVisible();
    expect(within(second).getByLabelText('Subject')).toHaveValue(
      'Keep editing',
    );
    expect(screen.getByRole('combobox', { name: 'From address' })).toHaveValue(
      JSON.stringify(['other', 'other-identity']),
    );
  });

  it('selects aliases with account-scoped identities and excludes unsendable addresses', async () => {
    mockMultipleAccounts();
    mail.listIdentities.mockImplementation((accountId: string) =>
      Promise.resolve([
        {
          id: 'primary',
          address: `${accountId}@example.com`,
          isPrimary: true,
          canSend: true,
        },
        {
          id: 'alias',
          address: `${accountId}-alias@example.com`,
          isPrimary: false,
          canSend: true,
        },
        {
          id: 'disabled',
          address: `${accountId}-disabled@example.com`,
          isPrimary: false,
          canSend: false,
        },
      ]),
    );
    render(<MailSendPage />);
    const from = await screen.findByRole('combobox', { name: 'From address' });
    expect(within(from).getAllByRole('option')).toHaveLength(4);
    expect(from).not.toHaveTextContent('disabled@example.com');
    fireEvent.change(from, {
      target: { value: JSON.stringify(['other', 'alias']) },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'TO', exact: true }), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
      target: { value: 'From alias' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Alias body</p>';
    fireEvent.input(body);
    await waitFor(() =>
      expect(mail.listSignatures).toHaveBeenCalledWith('other'),
    );
    expect(screen.getByRole('combobox', { name: 'From address' })).toHaveValue(
      JSON.stringify(['other', 'alias']),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'other',
          identityId: 'alias',
          subject: 'From alias',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(''),
    );
    expect(screen.getByRole('combobox', { name: 'From address' })).toHaveValue(
      JSON.stringify(['other', 'alias']),
    );
  });

  it('renders the center composer inline and sends cc, bcc and attachments', async () => {
    const { container } = render(<MailSendPage />);
    const to = await screen.findByLabelText('TO');
    expect(container).toContainElement(to);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close composer' }),
    ).not.toBeInTheDocument();
    fireEvent.change(to, { target: { value: 'recipient@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bcc' }));
    fireEvent.change(screen.getByLabelText('CC'), {
      target: { value: 'copy@example.com' },
    });
    fireEvent.change(screen.getByLabelText('BCC'), {
      target: { value: 'hidden@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Hello' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Message</p>';
    fireEvent.input(body);
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      },
    });
    await screen.findByText('notes.txt');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account',
          identityId: 'sender',
          to: [{ address: 'recipient@example.com' }],
          cc: [{ address: 'copy@example.com' }],
          bcc: [{ address: 'hidden@example.com' }],
          attachmentIds: ['upload'],
          subject: 'Hello',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue(''),
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Compose' }),
    ).not.toBeInTheDocument();
  });
  it('uses the same form for separate sending, deduplicating recipients and preserving content and schedule', async () => {
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com;bob@example.com;ALICE@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Shared body</p>';
    fireEvent.input(body);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Schedule send' }));
    fireEvent.change(screen.getByLabelText('Send later (optional)'), {
      target: { value: '2099-01-01T10:00' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            { address: 'alice@example.com' },
            { address: 'bob@example.com' },
          ],
          subject: 'Update',
          text: 'Shared body',
          scheduledAt: new Date('2099-01-01T10:00').toISOString(),
        }),
      ),
    );
    expect(mail.sendMessage).not.toHaveBeenCalled();
    expect(mail.sendBulk.mock.calls[0][0]).not.toHaveProperty('draftMessageId');
  });

  it('sends saved draft attachments without sharing a consumable draft across recipients', async () => {
    mail.saveDraft.mockResolvedValue({
      id: 'draft',
      attachments: [
        {
          id: 'draft-attachment',
          messageId: 'draft',
          outboundAttachmentId: 'saved-upload',
          providerAttachmentId: 'provider-file',
          fileName: 'report.txt',
          contentType: 'text/plain',
          size: 4,
          inline: false,
        },
      ],
    });
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await waitFor(() => expect(mail.saveDraft).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await screen.findByText('report.txt');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['saved-upload'] }),
      ),
    );
    expect(mail.sendBulk.mock.calls[0][0]).not.toHaveProperty('draftMessageId');
    expect(mail.downloadAttachment).not.toHaveBeenCalled();
  });

  it('copies provider draft attachments before separate sending', async () => {
    mail.saveDraft.mockResolvedValue({
      id: 'draft',
      attachments: [
        {
          id: 'remote-file',
          messageId: 'draft',
          providerAttachmentId: 'provider-file',
          fileName: 'remote.txt',
          contentType: 'text/plain',
          size: 4,
          inline: false,
        },
      ],
    });
    mail.downloadAttachment.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
          controller.close();
        },
      }),
    );
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await screen.findByText('remote.txt', {}, { timeout: 3000 });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['upload'] }),
      ),
    );
    expect(mail.downloadAttachment).toHaveBeenCalledWith(
      'account',
      'draft',
      'remote-file',
    );
    expect(mail.uploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'remote.txt', size: 4 }),
    );
  });

  it('preserves the form and reuses the batch key when retrying a failed request', async () => {
    mail.sendBulk.mockRejectedValueOnce(new Error('Offline'));
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('Subject')).toHaveValue('Update');
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() => expect(mail.sendBulk).toHaveBeenCalledTimes(2));
    expect(mail.sendBulk.mock.calls[1][0]).toEqual(
      mail.sendBulk.mock.calls[0][0],
    );
  });

  it('reuses the original normal-send request after a lost response and intervening autosave', async () => {
    mail.sendMessage.mockRejectedValueOnce(new Error('Offline'));
    mail.saveDraft.mockResolvedValue({
      id: 'draft',
      attachments: [
        {
          id: 'saved-file',
          messageId: 'draft',
          outboundAttachmentId: 'upload',
          providerAttachmentId: 'upload',
          fileName: 'notes.txt',
          contentType: 'text/plain',
          size: 4,
          inline: false,
        },
      ],
    });
    const { container } = render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      },
    });
    await screen.findByText('notes.txt');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await waitFor(() => expect(mail.saveDraft).toHaveBeenCalled(), {
      timeout: 2500,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mail.sendMessage).toHaveBeenCalledTimes(2));
    expect(mail.sendMessage.mock.calls[1][0]).toEqual(
      mail.sendMessage.mock.calls[0][0],
    );
  });

  it('uses a new normal-send key after editing the attempted message', async () => {
    mail.sendMessage.mockRejectedValueOnce(new Error('Offline'));
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Changed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mail.sendMessage).toHaveBeenCalledTimes(2));
    expect(mail.sendMessage.mock.calls[1][0].idempotencyKey).not.toBe(
      mail.sendMessage.mock.calls[0][0].idempotencyKey,
    );
    expect(mail.sendMessage.mock.calls[1][0].subject).toBe('Changed');
  });

  it('reports partially accepted delivery without offering an automatic resend', async () => {
    mail.sendMessage.mockResolvedValue({
      status: 'accepted',
      error: {
        code: 'SMTP_RECIPIENTS_REJECTED',
        category: 'recipient',
        retryable: false,
        recipients: {
          accepted: ['alice@example.com'],
          rejected: ['bob@example.com'],
        },
      },
    });
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US'],
    });
    runtime.registerNamespace(MAIL_PLUGIN_NS, locales);
    await runtime.init();
    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={MAIL_PLUGIN_NS}>
          <MailSendPage />
        </NamespaceScope>
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('To'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText(/Some recipients were rejected: bob@example.com/),
    ).toBeVisible();
    expect(screen.getByLabelText('Subject')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not silently discard Cc or Bcc when sending separately', async () => {
    render(<MailSendPage />);
    await screen.findByLabelText('TO');
    fireEvent.click(screen.getByRole('button', { name: 'Cc' }));
    fireEvent.change(screen.getByLabelText('CC'), {
      target: { value: 'copy@example.com' },
    });
    expect(
      screen.getByRole('button', { name: 'Send separately' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Separate sending does not support Cc or Bcc. Clear them to send separately.',
      ),
    ).toBeVisible();
    expect(mail.sendBulk).not.toHaveBeenCalled();
  });

  it('allows retrying account loading after an error', async () => {
    mail.listAccounts.mockRejectedValueOnce(new Error('Offline'));
    render(<MailSendPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Reload accounts' }));
    expect(await screen.findByLabelText('TO')).toBeVisible();
  });
});
