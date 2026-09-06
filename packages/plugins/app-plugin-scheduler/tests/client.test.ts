import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('@nocobase/app-plugin-scheduler', () => {
  it('contributes a Schedule Settings list and an App-owned detail route', async () => {
    expect(routes).toMatchObject([
      {
        parent: 'settings',
        routes: [
          {
            name: 'automation',
            path: '/automation',
            extend: true,
            navigation: { title: 'nav.automation' },
            children: [
              {
                name: 'schedules',
                path: '/schedules',
                navigation: { title: 'nav.schedules' },
                access: {
                  resource: 'scheduler.schedules',
                  action: 'access',
                },
              },
            ],
          },
        ],
      },
      {
        parent: 'app',
        routes: [
          {
            name: 'schedule-detail',
            path: '/settings/automation/schedules/:scheduleId',
            access: {
              resource: 'scheduler.schedules',
              action: 'access',
            },
          },
        ],
      },
    ]);
    const list = routes[0]?.routes[0]?.children?.[0];
    await expect(list?.componentLoader?.()).resolves.toHaveProperty('default');
    const detail = routes[1]?.routes[0];
    await expect(detail?.componentLoader?.()).resolves.toHaveProperty(
      'default',
    );
  });
});
