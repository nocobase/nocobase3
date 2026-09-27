import type { Toaster, ToastOptions } from '@nocobase/app-client';
import type { ReactNode } from 'react';

import { toast } from '@/components/ui/toast';

/**
 * The application's toaster, registered under `toasterToken` in `client/service-provider.ts`. Plugins and pages
 * report through `useToaster()`; this forwards what they report to the Base UI toast manager rendered by the
 * `Toaster` that `client/react-providers.ts` mounts. How a toast is presented is decided here, not at each call site,
 * so changing the toast UI changes this file and nothing that shows a toast.
 *
 * The manager reaches the `Toaster` once it has subscribed, in an effect that runs when the application first renders
 * and before any page does, since pages are lazy routes. A toast shown earlier than that, from a component mounted
 * together with the `Toaster`, would be dropped.
 */
export function createToaster(manager: typeof toast = toast): Toaster {
  return {
    show: (options: ToastOptions): string =>
      manager.add({
        id: options.id,
        type: options.type,
        title: options.title,
        description: options.description,
        timeout: options.duration,
        priority: isUrgent(options) ? 'high' : 'low',
        actionProps: options.action
          ? { children: options.action.label, onClick: options.action.onClick }
          : undefined,
        onClose: options.onClose,
      }),
    close: (id: string): void => manager.close(id),
  };
}

/**
 * Base UI announces a high-priority toast at once, but hides the toast itself from assistive technology until the
 * toast viewport is focused, and repeats its title and description in a visually hidden alert. That suits an error
 * written as plain text. An error that carries a control — an action, or a description with a toggle such as Hub's
 * technical details — keeps the default priority, so the control is neither hidden nor duplicated.
 */
function isUrgent({ type, title, description, action }: ToastOptions): boolean {
  return (
    type === 'error' &&
    action === undefined &&
    isText(title) &&
    (description === undefined || isText(description))
  );
}

function isText(node: ReactNode): boolean {
  return typeof node === 'string' || typeof node === 'number';
}
