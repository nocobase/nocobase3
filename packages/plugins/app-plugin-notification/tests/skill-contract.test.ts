import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('@nocobase/app-plugin-notification Agent Skill contract', () => {
  it('publishes the package-owned notification Skill', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { readonly files: readonly string[] };
    const skill = readFileSync(
      path.join(
        packageRoot,
        'skills/nocobase-app-plugin-notification/SKILL.md',
      ),
      'utf8',
    );
    const sendingNotifications = readFileSync(
      path.join(
        packageRoot,
        'skills/nocobase-app-plugin-notification/references/sending-notifications.md',
      ),
      'utf8',
    );
    const channelExtensions = readFileSync(
      path.join(
        packageRoot,
        'skills/nocobase-app-plugin-notification/references/channel-and-provider-extensions.md',
      ),
      'utf8',
    );

    expect(packageJson.files).toContain('skills');
    expect(skill).toContain('name: nocobase-app-plugin-notification');
    expect(sendingNotifications).toContain('notificationServiceToken');
    expect(channelExtensions).toContain('notificationExtensionRegistryToken');
    expect(skill).toContain('references/delivery-diagnostics.md');
    expect(skill).toMatch(/resolve missing details before sending/i);
    expect(skill).toMatch(/Test sends reach real recipients/i);
    expect(skill).toMatch(/A submitted notification cannot be recalled/i);
    expect(skill).toContain('`notification:test` `send`');

    const references = [
      'notification-concepts.md',
      'integration-and-configuration.md',
      'sending-notifications.md',
      'delivery-diagnostics.md',
      'channel-and-provider-extensions.md',
    ];
    for (const reference of references) {
      expect(
        existsSync(
          path.join(
            packageRoot,
            'skills/nocobase-app-plugin-notification/references',
            reference,
          ),
        ),
      ).toBe(true);
      expect(skill).toContain(`references/${reference}`);
    }
  });
});
