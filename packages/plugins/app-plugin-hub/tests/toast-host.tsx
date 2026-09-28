import { Toast } from '@base-ui/react/toast';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

/**
 * Stands in for the application's Toaster, which gives Hub pages the provider
 * `Toast.useToastManager()` requires. Toasts render as plain text, so a test
 * sees what a page reported rather than Base UI's dialog and announcer markup.
 */
export function ToastHost({ children }: PropsWithChildren): ReactElement {
  return (
    <Toast.Provider>
      {children}
      <ToastList />
    </Toast.Provider>
  );
}

function ToastList(): ReactNode {
  const { toasts } = Toast.useToastManager();
  return toasts
    .filter((toast) => toast.transitionStatus !== 'ending')
    .map((toast) => (
      <div key={toast.id} data-toast-type={toast.type}>
        <div>{toast.title}</div>
        {toast.description ? <div>{toast.description}</div> : null}
      </div>
    ));
}
