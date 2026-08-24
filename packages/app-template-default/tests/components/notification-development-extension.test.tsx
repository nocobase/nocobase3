import { describe, expect, it } from 'vitest';

import notificationExtension from '../../registry/nocobase-notification/extension.tsx';

describe('notification development extension', () => {
  it('contributes notification pages to the development menu', () => {
    expect(notificationExtension.dev?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification-in-app',
          list: 'notifications',
        }),
      ]),
    );
  });
});
