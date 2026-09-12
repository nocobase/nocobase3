import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Deployments } from '../../../../plugins/app-plugin-hub/client/pages/hub/deployments.js';
import type { AppDetail } from '../../../../plugins/app-plugin-hub/client/pages/hub/types.js';

const app = {
  app: { id: 'a', currentDeploymentId: null },
  hasReleases: true,
  deployments: [
    {
      id: 'deployment-one',
      kind: 'deploy',
      status: 'succeeded',
      createdAt: '2026-09-01T00:00:00Z',
      release: { version: 'fixture', checksum: 'abc' },
    },
  ],
} as AppDetail;

describe('Hub deployment pagination', () => {
  it('navigates pages and preserves rows while loading', () => {
    const onPage = vi.fn();
    const props = {
      app,
      busy: false,
      onDeploy: vi.fn(),
      onRollback: vi.fn(),
      onPage,
    };
    const { rerender } = render(
      <Deployments
        {...props}
        pagination={{ page: 1, pageSize: 20, total: 21 }}
        loading={false}
      />,
    );
    const getPaginationLink = (index: number): HTMLElement =>
      screen
        .getAllByRole('button')
        .filter(
          (element) => element.getAttribute('data-slot') === 'pagination-link',
        )[index]!;
    const previousPage = getPaginationLink(0);
    expect(previousPage).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(previousPage);
    expect(onPage).not.toHaveBeenCalled();
    fireEvent.click(getPaginationLink(1));
    expect(onPage).toHaveBeenCalledWith(2);
    rerender(
      <Deployments
        {...props}
        pagination={{ page: 1, pageSize: 20, total: 21 }}
        loading
      />,
    );
    expect(screen.getByText('vfixture')).toBeInTheDocument();
    const loadingNextPage = getPaginationLink(1);
    expect(loadingNextPage).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(loadingNextPage);
    expect(onPage).toHaveBeenCalledTimes(1);
    rerender(
      <Deployments
        {...props}
        pagination={{ page: 2, pageSize: 20, total: 21 }}
        loading={false}
      />,
    );
    expect(
      screen.getByText('21 deployments · Page 2 of 2'),
    ).toBeInTheDocument();
    const finalNextPage = getPaginationLink(1);
    expect(finalNextPage).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(getPaginationLink(0));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });
});
