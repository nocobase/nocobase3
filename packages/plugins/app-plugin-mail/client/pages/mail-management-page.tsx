import { RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailDevPageShell } from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailAddress,
  type MailFolder,
  type MailManagementMessageAction,
  type MailMessageSummary,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();
const PAGE_SIZE = 100;

interface ManagedFolderOption extends Pick<MailFolder, 'name' | 'type'> {
  readonly accountId: string;
  readonly providerFolderId: string;
}

export default function MailManagementPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [folderNames, setFolderNames] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [folderOptions, setFolderOptions] = useState<
    readonly ManagedFolderOption[]
  >([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [messages, setMessages] = useState<readonly MailMessageSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [actionBusy, setActionBusy] = useState<MailManagementMessageAction>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestIdRef = useRef(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const reportError = useCallback(
    (cause: unknown): void => {
      setError(
        mailErrorMessage(
          cause,
          t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
        ),
      );
    },
    [t],
  );

  const loadAccounts = useCallback((): void => {
    void mail
      .listManagementAccounts()
      .then(async (nextAccounts) => {
        setAccounts(nextAccounts);
        const folderGroups = await Promise.all(
          nextAccounts.map(async (account) => ({
            accountId: account.id,
            folders: await mail.listManagedFolders(account.id),
          })),
        );
        setFolderNames(
          new Map(
            folderGroups.flatMap(({ accountId: ownerId, folders }) =>
              folders.map(
                (folder) =>
                  [
                    `${ownerId}:${folder.providerFolderId}`,
                    folder.name,
                  ] as const,
              ),
            ),
          ),
        );
        setFolderOptions(
          folderGroups.flatMap(({ accountId: ownerId, folders }) =>
            folders.map((folder) => ({
              accountId: ownerId,
              providerFolderId: folder.providerFolderId,
              name: folder.name,
              type: folder.type,
            })),
          ),
        );
      })
      .catch(reportError);
  }, [reportError]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts, reloadVersion]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    void Promise.resolve()
      .then(() => {
        if (requestIdRef.current !== requestId) return undefined;
        setLoading(true);
        setError(undefined);
        return mail.listManagedMessages({
          accountId: accountId || undefined,
          query: debouncedQuery.trim() || undefined,
          limit: PAGE_SIZE,
        });
      })
      .then((page) => {
        if (!page || requestIdRef.current !== requestId) return;
        setMessages(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current === requestId) reportError(cause);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [accountId, debouncedQuery, reloadVersion, reportError]);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.address])),
    [accounts],
  );

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedKeys.has(messageKey(message))),
    [messages, selectedKeys],
  );
  const allSelected =
    messages.length > 0 && selectedMessages.length === messages.length;
  const someSelected = selectedMessages.length > 0 && !allSelected;
  const folderOptionsById = useMemo(() => {
    const options = new Map<string, ManagedFolderOption>();
    for (const folder of folderOptions) {
      if (!options.has(folder.providerFolderId)) {
        options.set(folder.providerFolderId, folder);
      }
    }
    return [...options.values()];
  }, [folderOptions]);
  const canPermanentlyDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every((message) =>
      message.folderIds.some(
        (folderId) =>
          folderOptions.find(
            (folder) =>
              folder.accountId === message.accountId &&
              folder.providerFolderId === folderId,
          )?.type === 'trash',
      ),
    );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleMessage = (message: MailMessageSummary): void => {
    const key = messageKey(message);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllMessages = (): void => {
    setSelectedKeys(
      allSelected ? new Set() : new Set(messages.map(messageKey)),
    );
  };

  const runAction = (
    action: MailManagementMessageAction,
    options: {
      readonly permanently?: boolean;
      readonly folderId?: string;
    } = {},
  ): void => {
    if (selectedMessages.length === 0 || actionBusy) return;
    if (action === 'move' && !options.folderId) {
      setActionError(
        t('dev.management.selectFolder', {
          defaultValue: 'Select a destination folder first.',
        }),
      );
      return;
    }
    const actionLabel = managementActionLabel(action);
    if (
      !window.confirm(
        t('dev.management.confirmAction', {
          defaultValue: `Apply “${actionLabel}” to ${selectedMessages.length} selected messages?`,
          action: actionLabel,
          count: selectedMessages.length,
        }),
      )
    ) {
      return;
    }
    if (
      action === 'delete' &&
      options.permanently &&
      !window.confirm(
        t('dev.management.confirmPermanentDelete', {
          defaultValue:
            'This permanently deletes the selected messages from Trash and cannot be undone. Continue?',
        }),
      )
    ) {
      return;
    }
    setActionBusy(action);
    setActionError(undefined);
    void mail
      .manageMessages({
        action,
        items: selectedMessages.map((message) => ({
          accountId: message.accountId,
          messageId: message.id,
        })),
        ...(options.folderId ? { providerFolderId: options.folderId } : {}),
        ...(action === 'delete'
          ? { permanently: options.permanently ?? false }
          : {}),
      })
      .then((result) => {
        setSelectedKeys(
          new Set(
            result.items
              .filter((item) => item.status === 'failed')
              .map((item) => `${item.accountId}:${item.messageId}`),
          ),
        );
        if (result.failed > 0) {
          setActionError(
            t('dev.management.partialFailure', {
              defaultValue: `${result.succeeded} succeeded, ${result.failed} failed. Failed messages remain selected for retry.`,
              succeeded: result.succeeded,
              failed: result.failed,
            }),
          );
        }
        setReloadVersion((version) => version + 1);
      })
      .catch(reportError)
      .finally(() => setActionBusy(undefined));
  };

  const loadMore = (): void => {
    if (!nextCursor || loadingMore) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    void mail
      .listManagedMessages({
        accountId: accountId || undefined,
        query: debouncedQuery.trim() || undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      })
      .then((page) => {
        if (requestIdRef.current !== requestId) return;
        setMessages((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current === requestId) reportError(cause);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoadingMore(false);
      });
  };

  return (
    <MailDevPageShell
      badge={t('nav.dev', { defaultValue: 'Mail components' })}
      category={t('dev.managementCategory', {
        defaultValue: 'Message data',
      })}
      description={t('dev.managementDescription', {
        defaultValue:
          'Browse all synchronized messages across connected accounts.',
      })}
      title={t('dev.managementTitle', { defaultValue: 'Mail management' })}
      actions={
        <Button
          disabled={loading}
          onClick={() => {
            setSelectedKeys(new Set());
            setActionError(undefined);
            setReloadVersion((version) => version + 1);
          }}
          variant='outline'
        >
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
          />
          {t('actions.refresh', { defaultValue: 'Refresh' })}
        </Button>
      }
    >
      <div className='space-y-5 pb-12'>
        <section className='flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row'>
          <NativeSelect
            aria-label={t('dev.management.account', {
              defaultValue: 'Account',
            })}
            className='sm:w-72'
            onChange={(event) => {
              setSelectedKeys(new Set());
              setActionError(undefined);
              setAccountId(event.target.value);
            }}
            value={accountId}
          >
            <option value=''>
              {t('dev.management.allAccounts', {
                defaultValue: 'All accounts',
              })}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.address}
              </option>
            ))}
          </NativeSelect>
          <label className='relative min-w-0 flex-1'>
            <Search
              aria-hidden='true'
              className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            />
            <Input
              aria-label={t('dev.management.search', {
                defaultValue: 'Search subject or preview',
              })}
              className='pl-9'
              onChange={(event) => {
                setSelectedKeys(new Set());
                setActionError(undefined);
                setQuery(event.target.value);
              }}
              placeholder={t('dev.management.search', {
                defaultValue: 'Search subject or preview',
              })}
              value={query}
            />
          </label>
        </section>

        {messages.length > 0 ? (
          <section className='flex flex-col gap-3 rounded-2xl border bg-background p-3 shadow-sm lg:flex-row lg:items-center'>
            <label className='flex items-center gap-2 text-sm text-muted-foreground'>
              <input
                aria-label={t('dev.management.selectAll', {
                  defaultValue: 'Select all messages on this page',
                })}
                checked={allSelected}
                disabled={Boolean(actionBusy)}
                onChange={toggleAllMessages}
                ref={selectAllRef}
                type='checkbox'
              />
              {t('dev.management.selectedCount', {
                defaultValue: `${selectedMessages.length} selected`,
                count: selectedMessages.length,
              })}
            </label>
            <div className='flex flex-1 flex-wrap items-center gap-2'>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('markRead')}
                variant='outline'
              >
                {t('dev.management.actions.markRead', {
                  defaultValue: 'Mark read',
                })}
              </Button>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('markUnread')}
                variant='outline'
              >
                {t('dev.management.actions.markUnread', {
                  defaultValue: 'Mark unread',
                })}
              </Button>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('star')}
                variant='outline'
              >
                {t('dev.management.actions.star', { defaultValue: 'Star' })}
              </Button>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('unstar')}
                variant='outline'
              >
                {t('dev.management.actions.unstar', {
                  defaultValue: 'Remove star',
                })}
              </Button>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('archive')}
                variant='outline'
              >
                {t('dev.management.actions.archive', {
                  defaultValue: 'Archive',
                })}
              </Button>
              <Button
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onClick={() => runAction('delete')}
                variant='destructive'
              >
                {t('dev.management.actions.delete', { defaultValue: 'Delete' })}
              </Button>
              {canPermanentlyDelete ? (
                <Button
                  disabled={Boolean(actionBusy)}
                  onClick={() => runAction('delete', { permanently: true })}
                  variant='destructive'
                >
                  {t('dev.management.actions.permanentDelete', {
                    defaultValue: 'Permanently delete',
                  })}
                </Button>
              ) : null}
              <NativeSelect
                aria-label={t('dev.management.moveFolder', {
                  defaultValue: 'Destination folder',
                })}
                className='min-w-48'
                disabled={selectedMessages.length === 0 || Boolean(actionBusy)}
                onChange={(event) => setSelectedFolderId(event.target.value)}
                value={selectedFolderId}
              >
                <option value=''>
                  {t('dev.management.moveFolder', {
                    defaultValue: 'Move to folder…',
                  })}
                </option>
                {folderOptionsById.map((folder) => (
                  <option
                    key={folder.providerFolderId}
                    value={folder.providerFolderId}
                  >
                    {folder.name}
                  </option>
                ))}
              </NativeSelect>
              <Button
                disabled={
                  selectedMessages.length === 0 ||
                  !selectedFolderId ||
                  Boolean(actionBusy)
                }
                onClick={() =>
                  runAction('move', { folderId: selectedFolderId })
                }
                variant='outline'
              >
                {t('dev.management.actions.move', { defaultValue: 'Move' })}
              </Button>
            </div>
          </section>
        ) : null}

        {error || actionError ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error ?? actionError}
          </div>
        ) : null}

        <Card className='overflow-hidden rounded-2xl bg-background shadow-sm'>
          {loading ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              {t('workspace.loading', { defaultValue: 'Loading mail…' })}
            </div>
          ) : messages.length === 0 ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              {t('dev.management.empty', {
                defaultValue: 'No synchronized messages found.',
              })}
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[1450px] text-sm'>
                <thead className='border-b bg-muted/50 text-left text-xs text-muted-foreground'>
                  <tr>
                    <Header
                      label={t('dev.management.selection', {
                        defaultValue: 'Select',
                      })}
                    />
                    <Header label={t('dev.management.account')} />
                    <Header label={t('dev.management.sender')} />
                    <Header label={t('dev.management.recipients')} />
                    <Header label={t('dev.management.subject')} />
                    <Header label={t('dev.management.status')} />
                    <Header label={t('dev.management.folders')} />
                    <Header label={t('dev.management.attachments')} />
                    <Header label={t('dev.management.time')} />
                    <Header label={t('dev.management.providerMessageId')} />
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {messages.map((message) => (
                    <tr
                      className='align-top hover:bg-muted/30'
                      key={messageKey(message)}
                    >
                      <td className='px-4 py-3'>
                        <input
                          aria-label={t('dev.management.selectMessage', {
                            defaultValue: 'Select message',
                          })}
                          checked={selectedKeys.has(messageKey(message))}
                          disabled={Boolean(actionBusy)}
                          onChange={() => toggleMessage(message)}
                          type='checkbox'
                        />
                      </td>
                      <Cell>
                        {accountNames.get(message.accountId) ??
                          message.accountId}
                      </Cell>
                      <Cell>{formatAddress(message.from)}</Cell>
                      <Cell>{formatAddresses(message.to)}</Cell>
                      <td className='max-w-80 px-4 py-3'>
                        <p className='font-medium'>
                          {message.subject || t('workspace.noSubject')}
                        </p>
                        {message.preview ? (
                          <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>
                            {message.preview}
                          </p>
                        ) : null}
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex max-w-40 flex-wrap gap-1'>
                          <Status>
                            {t(
                              message.read
                                ? 'dev.management.read'
                                : 'dev.management.unread',
                            )}
                          </Status>
                          {message.starred ? (
                            <Status>{t('dev.management.starred')}</Status>
                          ) : null}
                          {message.draft ? (
                            <Status>{t('dev.management.draft')}</Status>
                          ) : null}
                        </div>
                      </td>
                      <Cell>
                        {message.folderIds.length
                          ? message.folderIds
                              .map(
                                (id) =>
                                  folderNames.get(
                                    `${message.accountId}:${id}`,
                                  ) ?? id,
                              )
                              .join(', ')
                          : t('dev.management.none')}
                      </Cell>
                      <Cell>
                        {message.hasAttachments
                          ? '✓'
                          : t('dev.management.none')}
                      </Cell>
                      <Cell>
                        {formatTimestamp(message.receivedAt ?? message.sentAt)}
                      </Cell>
                      <td className='max-w-64 break-all px-4 py-3 font-mono text-xs text-muted-foreground'>
                        {message.providerMessageId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor ? (
            <div className='border-t p-3'>
              <Button
                className='w-full'
                disabled={loadingMore}
                onClick={loadMore}
                variant='outline'
              >
                {t('dev.management.loadMore', {
                  defaultValue: 'Load more messages',
                })}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </MailDevPageShell>
  );
}

function Header({ label }: { readonly label: string }): ReactElement {
  return <th className='px-4 py-3 font-medium'>{label}</th>;
}

function Cell({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <td className='max-w-64 break-words px-4 py-3 text-muted-foreground'>
      {children}
    </td>
  );
}

function Status({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <span className='rounded-full border bg-background px-2 py-0.5 text-xs'>
      {children}
    </span>
  );
}

function formatAddress(address: MailAddress | undefined): string {
  if (!address) return '—';
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: readonly MailAddress[]): string {
  return addresses.length ? addresses.map(formatAddress).join(', ') : '—';
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function messageKey(message: MailMessageSummary): string {
  return `${message.accountId}:${message.id}`;
}

function managementActionLabel(action: MailManagementMessageAction): string {
  switch (action) {
    case 'markRead':
      return 'Mark read';
    case 'markUnread':
      return 'Mark unread';
    case 'star':
      return 'Star';
    case 'unstar':
      return 'Remove star';
    case 'archive':
      return 'Archive';
    case 'move':
      return 'Move';
    case 'delete':
      return 'Delete';
  }
}
