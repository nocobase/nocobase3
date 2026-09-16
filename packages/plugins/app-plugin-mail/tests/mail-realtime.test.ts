import { describe, expect, it, vi } from 'vitest';

import {
  createMailMessageChangeNotifier,
  notifyMailMessageChange,
  type MailMessageChangeNotifier,
  type MailRealtimeTopic,
} from '../server/realtime.js';

describe('Mail realtime notifications', () => {
  it('publishes a user-scoped invalidation event', () => {
    const publishFor = vi.fn();
    const notifier = createMailMessageChangeNotifier({
      publishFor,
    } satisfies MailRealtimeTopic);

    notifier.notify('user-1');

    expect(publishFor).toHaveBeenCalledWith('user-1', {
      kind: 'mail.changed',
    });
  });

  it('does not make persistence fail when realtime publishing fails', () => {
    const error = new Error('socket unavailable');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const notifier: MailMessageChangeNotifier = {
      notify: vi.fn(() => {
        throw error;
      }),
    };

    expect(() => notifyMailMessageChange(notifier, 'user-1')).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to publish Mail realtime event.',
      error,
    );

    consoleError.mockRestore();
  });
});
