import {
  createServiceToken,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import { useContext, type ReactNode } from 'react';

import { ClientApplicationContext } from './application-context.js';

/** What a toast reports. The application picks its icon and color, and may present each kind differently. */
export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading';

/** A button shown inside a toast. */
export interface ToastAction {
  readonly label: ReactNode;
  readonly onClick: () => void;
}

/**
 * What a toast says. Where it appears, how it looks and how assistive technology announces it are decided by the
 * application's toaster, not by the code that shows it.
 */
export interface ToastOptions {
  /**
   * Identifies the toast. Showing a toast with the id of one still open replaces that toast's content and restarts
   * its timer instead of adding a second one.
   */
  readonly id?: string;
  readonly type?: ToastType;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /**
   * Milliseconds until the toast closes by itself; `0` keeps it open until it is closed. Omit it for the
   * application's default. A `loading` toast never closes by itself.
   */
  readonly duration?: number;
  readonly action?: ToastAction;
  /** Runs when the toast starts closing: when it times out, when the user dismisses it, and when `close` is called. */
  readonly onClose?: () => void;
}

/**
 * Shows transient feedback, such as the result of an action. Plugins and application code reach it through
 * `useToaster()`, so none of them depends on how toasts are rendered; the application supplies the implementation
 * by registering it under `toasterToken`.
 */
export interface Toaster {
  /** Shows a toast and returns its id. */
  show(options: ToastOptions): string;
  /** Closes the toast with this id. An id that is not showing is ignored. */
  close(id: string): void;
}

/**
 * The application registers its toaster here, from a client ServiceProvider's `register()`. Nothing registers one by
 * default: rendering toasts belongs to the application's UI, which `@nocobase/app-client` does not choose.
 */
export const toasterToken: ServiceToken<Toaster> = createServiceToken<Toaster>(
  '@nocobase/app-client/toaster',
);

let unregisteredToastCount = 0;
let warnedUnregistered = false;

/**
 * Stands in when the application registered no toaster. A missing toaster should cost the user a message, never the
 * page that reports it, so nothing throws; the first toast it drops says so in the console.
 */
const unregisteredToaster: Toaster = Object.freeze({
  show(options: ToastOptions): string {
    if (!warnedUnregistered) {
      warnedUnregistered = true;
      console.warn(
        "A toast was shown, but the application registers no toaster, so nothing appeared. Register one under toasterToken from '@nocobase/app-client' in a client ServiceProvider's register().",
      );
    }
    unregisteredToastCount += 1;
    return options.id ?? `unregistered-toast-${unregisteredToastCount}`;
  },
  close(): void {},
});

/**
 * Returns the toaster registered in `services`, or one that shows nothing and warns once when none is. For code
 * outside React, such as a ServiceProvider; components call `useToaster()`.
 */
export function resolveToaster(services: ServiceResolver): Toaster {
  return services.has(toasterToken)
    ? services.resolve(toasterToken)
    : unregisteredToaster;
}

/**
 * Returns the application's toaster. The same instance is returned on every render, so it can be listed in hook
 * dependencies. Outside an application, or in one that registers no toaster, toasts show nothing and the first one
 * warns in the console rather than throwing.
 */
export function useToaster(): Toaster {
  const app = useContext(ClientApplicationContext);
  return app ? resolveToaster(app.services) : unregisteredToaster;
}
