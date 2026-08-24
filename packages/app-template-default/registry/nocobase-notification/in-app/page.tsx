import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { NavLink } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  fetchInbox,
  markInboxRead,
  mutateInboxItem,
  type InboxItem,
  type InboxMutationAction,
} from './api.js';
import { useNotificationInAppRuntime } from './runtime.js';

export function NotificationInAppPage(): React.ReactElement {
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
    setLoading(true);
    setError(undefined);
    fetchInbox({ unreadOnly }, controller.signal)
      .then((response) => {
        setItems(response.data);
        setNextCursor(response.nextCursor);
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [revision, unreadOnly]);

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
      await mutateInboxItem(item.id, action, item.version);
      inboxRuntime.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Inbox update failed.',
      );
      inboxRuntime.refresh();
    }
  };

  const loadMore = async (): Promise<void> => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await fetchInbox({
        unreadOnly,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...response.data]);
      setNextCursor(response.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not load more notifications.',
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
      await markInboxRead();
      inboxRuntime.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not mark notifications as read.',
      );
      inboxRuntime.refresh();
    }
  };

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-primary'>
            <Bell className='size-4' /> Personal inbox
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              Message center
            </h1>
            {unreadCount > 0 ? (
              <Badge variant='secondary'>{unreadCount} unread</Badge>
            ) : null}
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>
            Updates from the applications and workflows you use.
          </p>
        </div>
        <Button
          variant='outline'
          onClick={() => void readAll()}
          disabled={items.every((item) => item.readAt)}
        >
          <CheckCheck /> Mark all read
        </Button>
      </header>

      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b bg-muted/20 py-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle className='text-base'>Messages</CardTitle>
              <CardDescription>
                In-app messages keep an independent read state for the current
                user.
              </CardDescription>
            </div>
            <div className='flex gap-2'>
              <Button
                variant={unreadOnly ? 'default' : 'outline'}
                onClick={() => setUnreadOnly((value) => !value)}
              >
                Unread
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {error ? (
            <Alert variant='destructive' className='m-4'>
              <AlertTitle>Inbox unavailable</AlertTitle>
              <AlertDescription className='flex items-center justify-between gap-3'>
                {error}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => inboxRuntime.refresh()}
                >
                  <RefreshCw /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className='grid place-items-center gap-2 p-12 text-center'>
              <div className='grid size-12 place-items-center rounded-full bg-muted'>
                <Bell className='size-5 text-muted-foreground' />
              </div>
              <p className='font-medium'>You’re all caught up</p>
              <p className='text-sm text-muted-foreground'>
                New notifications will appear here.
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
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

function InboxRow({
  item,
  onMutate,
}: {
  readonly item: InboxItem;
  readonly onMutate: (
    item: InboxItem,
    action: InboxMutationAction,
  ) => Promise<void>;
}): React.ReactElement {
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
          <Badge variant='outline'>In-app</Badge>
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
              Open <ExternalLink />
            </Button>
          ) : null}
          <Button
            variant='ghost'
            size='sm'
            className='ml-auto'
            onClick={() => void onMutate(item, item.readAt ? 'unread' : 'read')}
          >
            {item.readAt ? 'Mark unread' : 'Mark read'}
          </Button>
          <Button
            aria-label='Delete notification'
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
