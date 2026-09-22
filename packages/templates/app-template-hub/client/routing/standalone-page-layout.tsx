import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { ThemeModeToggle } from '../theme/index.js';

export function StandalonePageLayout(): ReactElement {
  return (
    <div className='relative min-h-svh'>
      <div className='fixed top-4 right-4 z-50'>
        <ThemeModeToggle />
      </div>
      <Outlet />
    </div>
  );
}
