import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createToastManager, Toaster } from '@/components/ui/toast';
import { createToaster } from '@/lib/toaster';

describe('application toaster', () => {
  it('forwards what a toast reports to the Base UI toast manager', () => {
    const manager = createToastManager();
    const add = vi.spyOn(manager, 'add');
    const close = vi.spyOn(manager, 'close');
    const onClose = vi.fn();
    const toaster = createToaster(manager);

    const id = toaster.show({
      id: 'saved',
      type: 'success',
      title: 'Saved',
      description: 'All changes are stored.',
      duration: 4000,
      onClose,
    });
    toaster.close(id);

    expect(id).toBe('saved');
    expect(add).toHaveBeenCalledWith({
      id: 'saved',
      type: 'success',
      title: 'Saved',
      description: 'All changes are stored.',
      timeout: 4000,
      priority: 'low',
      onClose,
    });
    expect(close).toHaveBeenCalledWith('saved');
    expect(toaster.show({ title: 'Saved again' })).toEqual(expect.any(String));
  });

  it('renders an action as the toast button', () => {
    const manager = createToastManager();
    const add = vi.spyOn(manager, 'add');
    const onClick = vi.fn();

    createToaster(manager).show({
      type: 'info',
      title: 'Archived',
      action: { label: 'Undo', onClick },
    });

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ actionProps: { children: 'Undo', onClick } }),
    );
  });

  it('announces a plain-text error at once and keeps one that carries a control at the default priority', () => {
    const manager = createToastManager();
    const add = vi.spyOn(manager, 'add');
    const toaster = createToaster(manager);

    toaster.show({
      type: 'error',
      title: 'Unable to save',
      description: 'The server is unavailable.',
    });
    toaster.show({
      type: 'error',
      title: 'Unable to deploy',
      description: <button type='button'>Show technical details</button>,
    });
    toaster.show({
      type: 'error',
      title: 'Unable to save',
      action: { label: 'Retry', onClick: vi.fn() },
    });
    toaster.show({ type: 'success', title: 'Saved' });

    expect(add.mock.calls.map(([options]) => options.priority)).toEqual([
      'high',
      'low',
      'low',
      'low',
    ]);
  });

  it('shows the toast in the mounted Toaster', async () => {
    const manager = createToastManager();
    render(<Toaster toastManager={manager} />);

    act(() => {
      createToaster(manager).show({ type: 'success', title: 'Saved' });
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
