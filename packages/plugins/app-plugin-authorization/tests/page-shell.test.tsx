// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import { ManagementTable } from '../client/components/management-ui.js';
import { PermissionsPage } from '../client/components/page-shell.js';

describe('PermissionsPage', () => {
  it('flows with its content unless asked to fill', () => {
    render(
      <PermissionsPage title='Rules' description='All rules'>
        <div>Panel</div>
      </PermissionsPage>,
    );
    const panel = screen.getByText('Panel');
    expect(panel.parentElement).not.toHaveClass('lg:flex-1');
    expect(screen.getByRole('main')).not.toHaveClass('lg:h-full');
  });

  it('passes the scroll viewport height down when filling', () => {
    render(
      <PermissionsPage title='Rules' description='All rules' fill>
        <div>Panel</div>
      </PermissionsPage>,
    );
    // A page with its own scroll regions only stays the sole scroller while
    // the shell hands it the viewport height instead of growing past it.
    expect(screen.getByRole('main')).toHaveClass(
      'lg:flex',
      'lg:h-full',
      'lg:min-h-[36rem]',
      'lg:flex-col',
    );
    expect(screen.getByText('Panel').parentElement).toHaveClass(
      'lg:flex',
      'lg:min-h-0',
      'lg:flex-1',
      'lg:flex-col',
    );
  });
});

describe('ManagementTable', () => {
  it('keeps its card chrome and accepts layout classes', () => {
    render(
      <ManagementTable className='lg:flex lg:min-h-0'>
        <div>Rows</div>
      </ManagementTable>,
    );
    expect(screen.getByText('Rows').parentElement).toHaveClass(
      'overflow-hidden',
      'rounded-xl',
      'lg:flex',
      'lg:min-h-0',
    );
  });
});
