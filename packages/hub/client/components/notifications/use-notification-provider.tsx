import type { NotificationProvider } from '@refinedev/core';
import { translate } from '@nocobase/app-portal-sdk/i18n';
import { toast } from 'sonner';
import { UndoableNotification } from '@/components/notifications/undoable-notification';

export function useNotificationProvider(): NotificationProvider {
  return {
    open: ({
      key,
      type,
      message,
      description,
      undoableTimeout,
      cancelMutation,
    }) => {
      switch (type) {
        case 'success':
          toast.success(message, {
            id: key,
            description,
            richColors: true,
          });
          return;

        case 'error':
          toast.error(localizeErrorMessage(key, message), {
            id: key,
            description: localizeErrorDescription(key, description),
            richColors: true,
          });
          return;

        case 'progress': {
          const toastId = key || Date.now();

          toast(
            () => (
              <UndoableNotification
                message={message}
                description={description}
                undoableTimeout={undoableTimeout}
                cancelMutation={cancelMutation}
                onClose={() => toast.dismiss(toastId)}
              />
            ),
            {
              id: toastId,
              duration: (undoableTimeout || 5) * 1000,
              unstyled: true,
            },
          );
          return;
        }

        default:
          return;
      }
    },
    close: (id) => {
      toast.dismiss(id);
    },
  };
}

function localizeErrorMessage(
  key: string | number | undefined,
  message: React.ReactNode,
): React.ReactNode {
  if (key !== 'login-error' || !isSimplifiedChinese()) return message;
  return translate('hub.auth.signIn.error', 'Unable to sign in');
}

function localizeErrorDescription(
  key: string | number | undefined,
  description: React.ReactNode,
): React.ReactNode {
  if (key !== 'login-error' || !isSimplifiedChinese()) return description;
  if (
    typeof description === 'string' &&
    /invalid.*(?:username|email|password)|(?:username|email|password).*invalid/i.test(
      description,
    )
  ) {
    return translate(
      'hub.auth.error.invalidCredentials',
      'Invalid username or password.',
    );
  }
  return translate('hub.auth.error.default', 'Authentication failed.');
}

function isSimplifiedChinese(): boolean {
  return translate('locale.zh-CN', 'Simplified Chinese') === '简体中文';
}
