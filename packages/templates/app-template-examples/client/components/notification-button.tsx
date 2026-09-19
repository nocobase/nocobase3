import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@refinedev/core';
import { Bell } from 'lucide-react';
import { Link } from 'react-router';

export function NotificationButton() {
  const { session, isPending } = useAuthentication();
  const { data: access } = useCan({
    resource: 'notifications',
    action: 'access',
  });
  if (isPending || !session?.user || !access?.can) return null;
  return (
    <NotificationInAppProvider key={session.user.id}>
      <NotificationLink />
    </NotificationInAppProvider>
  );
}

function NotificationLink() {
  const { unreadCount } = useNotificationInAppRuntime();
  const { t } = useTranslation();
  const label =
    unreadCount > 0
      ? t('notifications.unreadLabel', { count: unreadCount })
      : t('navigation.notifications');
  return (
    <Link
      to='/notifications'
      aria-label={label}
      title={label}
      className='relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <Bell className='size-5' aria-hidden='true' />
      {unreadCount > 0 ? (
        <span
          aria-hidden='true'
          className='absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-xs font-medium text-primary-foreground'
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
