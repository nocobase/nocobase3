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
    expect(screen.getByLabelText('Go to previous page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByLabelText('Go to previous page'));
    expect(onPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Go to next page'));
    expect(onPage).toHaveBeenCalledWith(2);
    rerender(
      <Deployments
        {...props}
        pagination={{ page: 1, pageSize: 20, total: 21 }}
        loading
      />,
    );
    expect(screen.getByText('vfixture')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByLabelText('Go to next page'));
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
    expect(screen.getByLabelText('Go to next page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByLabelText('Go to previous page'));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });
});
