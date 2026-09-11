import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { getMailClient } from '../runtime.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';

const REFRESH_INTERVAL_MS = 60_000;
export const MAIL_UNREAD_COUNT_CHANGED_EVENT =
  'nocobase:mail-unread-count-changed';

/** App-navigation icon with a current-user unread badge. */
export function MailNavigationIcon(): ReactElement {
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void getMailClient()
        .getUnreadCount()
        .then((count) => {
          if (active) setUnread(count);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener(MAIL_UNREAD_COUNT_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(MAIL_UNREAD_COUNT_CHANGED_EVENT, refresh);
    };
  }, []);

  return (
    <span className='relative inline-flex size-4 items-center justify-center'>
      <Mail aria-hidden='true' className='size-4' />
      {unread > 0 ? (
        <span
          aria-label={t('nav.unread', {
            count: unread,
            defaultValue: '{{count}} unread messages',
          })}
          className='absolute -top-2 -right-2 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] leading-4 font-semibold text-destructive-foreground'
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </span>
  );
}
