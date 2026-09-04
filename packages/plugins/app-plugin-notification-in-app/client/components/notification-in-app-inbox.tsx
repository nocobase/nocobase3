import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { NavLink } from 'react-router';

import {
  fetchInbox,
  markInboxRead,
  mutateInboxItem,
  type InboxItem,
  type InboxMutationAction,
} from '../api.js';
import { IN_APP_NOTIFICATION_CLIENT_NAMESPACE } from '../i18n.js';
import { useNotificationInAppRuntime } from '../notification-in-app-runtime.js';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card.js';

export function NotificationInAppInbox(): ReactElement {
  const appClient = useService(appApiClientToken);
  const { t } = useTranslation(IN_APP_NOTIFICATION_CLIENT_NAMESPACE);
  const inboxRuntime = useNotificationInAppRuntime();
  const { revision, unreadCount } = inboxRuntime;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<readonly InboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetchInbox(appClient, { unreadOnly }, controller.signal)
      .then((response) => {
        setError(undefined);
        setItems(response.data);
        setNextCursor(response.nextCursor);
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [appClient, revision, unreadOnly]);

  const mutate = async (
    item: InboxItem,
    action: InboxMutationAction,
  ): Promise<void> => {
    setItems((current) =>
      action === 'delete'
        ? current.filter((candidate) => candidate.id !== item.id)
        : current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  readAt:
                    action === 'read' ? new Date().toISOString() : undefined,
                }
              : candidate,
          ),
    );
    try {
      await mutateInboxItem(appClient, item.id, action);
      inboxRuntime.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('inbox.errors.update', {
              defaultValue: 'Inbox update failed.',
            }),
      );
      inboxRuntime.refresh();
    }
  };

  const loadMore = async (): Promise<void> => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await fetchInbox(appClient, {
        unreadOnly,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...response.data]);
      setNextCursor(response.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('inbox.errors.loadMore', {
              defaultValue: 'Could not load more notifications.',
            }),
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const readAll = async (): Promise<void> => {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
    try {
      await markInboxRead(appClient);
      inboxRuntime.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('inbox.errors.markAllRead', {
              defaultValue: 'Could not mark notifications as read.',
            }),
      );
      inboxRuntime.refresh();
    }
  };

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-primary'>
            <Bell className='size-4' />{' '}
            {t('inbox.eyebrow', { defaultValue: 'Personal inbox' })}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('inbox.title', { defaultValue: 'Message center' })}
            </h1>
            {unreadCount > 0 ? (
              <Badge variant='secondary'>
                {t('inbox.unreadCount', {
                  count: unreadCount,
                  defaultValue: '{{count}} unread',
                })}
              </Badge>
            ) : null}
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('inbox.description', {
              defaultValue:
                'Updates from the applications and workflows you use.',
            })}
          </p>
        </div>
        <Button
          variant='outline'
          onClick={() => void readAll()}
          disabled={items.every((item) => item.readAt)}
        >
          <CheckCheck />{' '}
          {t('inbox.markAllRead', { defaultValue: 'Mark all read' })}
        </Button>
      </header>

      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b bg-muted/20 py-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>
                {t('inbox.messagesTitle', { defaultValue: 'Messages' })}
              </CardTitle>
              <CardDescription>
                {t('inbox.messagesDescription', {
                  defaultValue:
                    'In-app messages keep an independent read state for the current user.',
                })}
              </CardDescription>
            </div>
            <Button
              variant={unreadOnly ? 'default' : 'outline'}
              onClick={() => setUnreadOnly((value) => !value)}
            >
              {t('inbox.unreadFilter', { defaultValue: 'Unread' })}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {error ? (
            <Alert variant='destructive' className='m-4'>
              <AlertTitle>
                {t('inbox.unavailable', {
                  defaultValue: 'Inbox unavailable',
                })}
              </AlertTitle>
              <AlertDescription className='flex items-center justify-between gap-3'>
                {error}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => inboxRuntime.refresh()}
                >
                  <RefreshCw /> {t('inbox.retry', { defaultValue: 'Retry' })}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              {t('inbox.loading', {
                defaultValue: 'Loading notifications…',
              })}
            </div>
          ) : items.length === 0 ? (
            <div className='grid place-items-center gap-2 p-12 text-center'>
              <div className='grid size-12 place-items-center rounded-full bg-muted'>
                <Bell className='size-5 text-muted-foreground' />
              </div>
              <p className='font-medium'>
                {t('inbox.emptyTitle', {
                  defaultValue: 'You’re all caught up',
                })}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('inbox.emptyDescription', {
                  defaultValue: 'New notifications will appear here.',
                })}
              </p>
            </div>
          ) : (
            <div className='divide-y'>
              {items.map((item) => (
                <InboxRow key={item.id} item={item} onMutate={mutate} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {nextCursor ? (
        <Button
          className='self-center'
          variant='outline'
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore
            ? t('inbox.loadingMore', { defaultValue: 'Loading…' })
            : t('inbox.loadMore', { defaultValue: 'Load more' })}
        </Button>
      ) : null}
    </div>
  );
}

interface InboxRowProps {
  readonly item: InboxItem;
  readonly onMutate: (
    item: InboxItem,
    action: InboxMutationAction,
  ) => Promise<void>;
}

function InboxRow({ item, onMutate }: InboxRowProps): ReactElement {
  const { t } = useTranslation(IN_APP_NOTIFICATION_CLIENT_NAMESPACE);
  return (
    <article
      className={`flex gap-3 p-4 sm:p-5 ${item.readAt ? 'bg-background' : 'bg-primary/[0.035]'}`}
    >
      <div className='mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground'>
        <Bell className='size-4' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <h2 className='truncate font-medium'>{item.title}</h2>
              {!item.readAt ? (
                <span
                  className='size-2 shrink-0 rounded-full bg-primary'
                  aria-label='Unread'
                />
              ) : null}
            </div>
            <p className='mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground'>
              {item.body}
            </p>
          </div>
          <Badge variant='outline'>
            {t('inbox.channel', { defaultValue: 'In-app' })}
          </Badge>
        </div>
        <div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <time dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleString()}
          </time>
          {item.actionUrl ? (
            <Button
              nativeButton={false}
              render={<NavLink to={item.actionUrl} />}
              variant='link'
              size='sm'
              className='h-auto px-1 text-xs'
            >
              {t('inbox.open', { defaultValue: 'Open' })} <ExternalLink />
            </Button>
          ) : null}
          <Button
            variant='ghost'
            size='sm'
            className='ml-auto'
            onClick={() => void onMutate(item, item.readAt ? 'unread' : 'read')}
          >
            {item.readAt
              ? t('inbox.markUnread', { defaultValue: 'Mark unread' })
              : t('inbox.markRead', { defaultValue: 'Mark read' })}
          </Button>
          <Button
            aria-label={t('inbox.delete', {
              defaultValue: 'Delete notification',
            })}
            variant='ghost'
            size='icon-sm'
            onClick={() => void onMutate(item, 'delete')}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </article>
  );
}
