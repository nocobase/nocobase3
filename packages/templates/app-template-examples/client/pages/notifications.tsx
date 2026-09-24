import {
  NotificationInAppInbox,
  NotificationInAppProvider,
} from '@nocobase/app-plugin-notification-in-app/client';
import { PageContainer } from '@/components/page-container';

export default function NotificationsPage() {
  return (
    <PageContainer>
      <NotificationInAppProvider>
        <NotificationInAppInbox />
      </NotificationInAppProvider>
    </PageContainer>
  );
}
