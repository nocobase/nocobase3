import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { SkillsExampleProvider } from '../server/providers/skills-example.js';
import { DefaultAppNoticeService } from '../server/services/skills-example.js';
import { appNoticeServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-skills-example', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    const provider = new SkillsExampleProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-skills-example');
    expect(container.resolveIfCreated(appNoticeServiceToken)).toBeUndefined();

    provider.register();

    const service = container.resolve(appNoticeServiceToken);
    expect(service).toBeInstanceOf(DefaultAppNoticeService);
    expect(service.getDefaultNotice()).toMatchObject({
      title: 'Plugin Skills are working',
      tone: 'success',
    });
    expect(container.resolve(appNoticeServiceToken)).toBe(service);
  });
});
