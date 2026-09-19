// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import { TablePager } from '../client/components/management-ui.js';
import { pageRangeLabel, pageSlice } from '../client/components/pagination.js';
import { translate } from './locale-harness.js';

describe('pagination helpers', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  it('slices a page out of the rows the panel already holds', () => {
    expect(pageSlice(rows, 1, 10)).toEqual(rows.slice(0, 10));
    expect(pageSlice(rows, 3, 10)).toEqual(rows.slice(20));
  });

  it('clamps a page left beyond the end of a narrowed list', () => {
    expect(pageSlice(rows.slice(0, 4), 3, 10)).toEqual(rows.slice(0, 4));
  });

  it('reports the range and the total', () => {
    expect(pageRangeLabel(translate, 23, 1, 10)).toBe(
      translate('pagination.range', { first: 1, last: 10, total: 23 }),
    );
    expect(pageRangeLabel(translate, 23, 3, 10)).toBe(
      translate('pagination.range', { first: 21, last: 23, total: 23 }),
    );
    expect(pageRangeLabel(translate, 0, 1, 10)).toBe(
      translate('pagination.empty'),
    );
  });
});

describe('table pager', () => {
  it('states the range and disables the edges of the list', () => {
    const seen: number[] = [];
    render(
      <TablePager
        label='Rules'
        page={1}
        total={23}
        onPage={(page) => seen.push(page)}
      />,
    );
    expect(
      screen.getByText(
        translate('pagination.range', { first: 1, last: 10, total: 23 }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: translate('pagination.previous') }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: translate('pagination.next') }),
    );
    expect(seen).toEqual([2]);
  });

  it('shows nothing when there is nothing to page', () => {
    const { container } = render(
      <TablePager label='Rules' page={1} total={0} onPage={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
