import { describe, expect, it } from 'vitest';

import enUS from '../client/locales/en-US.js';
import { applicationsEnUS } from '../client/locales/resources/applications.js';
import { membersEnUS } from '../client/locales/resources/members.js';
import { operationsEnUS } from '../client/locales/resources/operations.js';
import zhCN from '../client/locales/zh-CN.js';

describe('@nocobase/app-plugin-hub locales', () => {
  it('publishes every Hub domain resource in both supported languages', () => {
    expect(enUS).toMatchObject(applicationsEnUS);
    expect(enUS).toMatchObject(operationsEnUS);
    expect(enUS).toMatchObject(membersEnUS);
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort());
  });
});
