import type { ReactElement } from 'react';

import { NotificationInAppInbox } from '../components/notification-in-app-inbox.js';
import { NotificationInAppProvider } from '../components/notification-in-app-provider.js';

export default function NotificationInAppDevPage(): ReactElement {
  return (
    <NotificationInAppProvider>
      <NotificationInAppInbox />
    </NotificationInAppProvider>
  );
}
