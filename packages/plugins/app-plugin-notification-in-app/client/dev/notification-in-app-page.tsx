import type { ReactElement } from 'react';

import { NotificationInAppInbox } from '../components/notification-in-app-inbox.js';
import { NotificationInAppProvider } from '../components/notification-in-app-provider.js';

export default function NotificationInAppDevPage(): ReactElement {
  return (
    <section className='px-6 py-10'>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </section>
  );
}
