import type { PropsWithChildren, ReactElement } from 'react';

import { Toaster } from './toaster.js';

export function NotificationHost({
  children,
}: PropsWithChildren): ReactElement {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
