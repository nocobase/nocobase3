import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';
import schedules from '../server/schedules.js';

describe('@nocobase/app-plugin-scheduled-workflow-example', () => {
  it('contributes its schedule definition', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-scheduled-workflow-example',
      schedules: { definitions: './server/schedules' },
    });
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      key: 'scheduled-test-workflow-every-5-minutes',
      enabled: true,
      schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
      target: {
        type: 'workflow',
        config: { workflowKey: 'scheduled-test-workflow', input: {} },
      },
    });
  });
});
