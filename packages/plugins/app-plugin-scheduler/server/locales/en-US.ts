import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: { automation: 'Automation' },
  authorization: { title: 'Schedules', read: 'Read' },
};

export type SchedulerResource = LocaleResource<typeof enUS>;

export default enUS;
