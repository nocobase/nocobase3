import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import {
  NotificationInAppProvider,
  useNotificationInAppRuntime,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

export function NotificationButton() {
  const { session, isPending } = useAuthentication();
  if (isPending || !session?.user) return null;
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
    <Tooltip>
      <TooltipTrigger
        render={<Link to='/notifications' />}
        aria-label={label}
        className='relative inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
      >
        <Bell className='size-5' aria-hidden='true' />
        {unreadCount > 0 ? (
          <span
            aria-hidden='true'
            className={`absolute -top-1 -right-1 flex h-4 items-center justify-center rounded-full bg-primary text-center text-xs font-medium text-primary-foreground ${unreadCount > 9 ? 'min-w-5 px-1' : 'w-4'}`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
