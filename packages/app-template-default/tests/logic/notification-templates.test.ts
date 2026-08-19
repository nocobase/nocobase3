// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createNotificationTemplateRegistry } from '../../registry/notification/templates/index.ts';

const definition = {
  key: 'order.ready', version: '1',
  commonSchema: z.object({ shop: z.string() }).strict(),
  recipientSchema: z.object({ name: z.string(), vip: z.boolean() }).strict(),
  channels: {
    inApp: { title: '{{ common.shop }}: order ready', body: 'Hello {{ recipient.name }}{% if recipient.vip %}, VIP{% endif %}', actionUrl: '/orders/{{ identity.userId }}' },
    email: { subject: 'Order for {{ recipient.name }}', text: 'Ready at {{ common.shop }}', html: '<p>Hello <strong>{{ recipient.name }}</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>' },
  },
} as const;

describe('developer notification templates', () => {
  it('renders distinct immutable channel snapshots per recipient and sanitizes HTML', async () => {
    const registry = createNotificationTemplateRegistry([definition]);
    const first = await registry.render({ key: definition.key, common: { shop: 'Main' }, recipient: { name: 'Alice', vip: true }, identity: { userId: 'u1' }, channels: ['in-app', 'email'] });
    const second = await registry.render({ key: definition.key, common: { shop: 'Main' }, recipient: { name: 'Bob', vip: false }, identity: { userId: 'u2' }, channels: ['in-app'] });

    expect(first).toMatchObject({ version: '1', inApp: { body: 'Hello Alice, VIP', actionUrl: '/orders/u1' }, email: { subject: 'Order for Alice' } });
    expect(second.inApp?.body).toBe('Hello Bob');
    expect(first.email?.html).not.toContain('script');
    expect(first.email?.html).not.toContain('javascript:');
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unknown/missing variables and schema extras', async () => {
    const registry = createNotificationTemplateRegistry([definition]);
    await expect(registry.render({ key: definition.key, common: {}, recipient: { name: 'Alice', vip: false }, identity: {}, channels: ['in-app'] })).rejects.toThrow();
    await expect(registry.render({ key: definition.key, common: { shop: 'Main', extra: true }, recipient: { name: 'Alice', vip: false }, identity: {}, channels: ['in-app'] })).rejects.toThrow();
    const unknown = createNotificationTemplateRegistry([{ ...definition, key: 'unknown', channels: { inApp: { title: '{{ common.missing }}', body: 'Body' } } }]);
    await expect(unknown.render({ key: 'unknown', common: { shop: 'Main' }, recipient: { name: 'Alice', vip: false }, identity: {}, channels: ['in-app'] })).rejects.toThrow();
  });

  it('rejects loops, include-like tags, arbitrary filters, and duplicate keys at startup', () => {
    expect(() => createNotificationTemplateRegistry([{ ...definition, key: 'loop', channels: { inApp: { title: '{% for item in common.items %}{{ item }}{% endfor %}', body: 'Body' } } }])).toThrow('not allowed');
    expect(() => createNotificationTemplateRegistry([{ ...definition, key: 'filter', channels: { inApp: { title: '{{ recipient.name | join: "," }}', body: 'Body' } } }])).toThrow('not allowed');
    expect(() => createNotificationTemplateRegistry([definition, definition])).toThrow('duplicate');
  });

  it('changes the content hash when a code-owned template changes', async () => {
    const first = await createNotificationTemplateRegistry([definition]).render({ key: definition.key, common: { shop: 'Main' }, recipient: { name: 'Alice', vip: false }, identity: { userId: 'u1' }, channels: ['in-app'] });
    const secondDefinition = { ...definition, version: '2', channels: { ...definition.channels, inApp: { ...definition.channels.inApp, body: 'Changed {{ recipient.name }}' } } };
    const second = await createNotificationTemplateRegistry([secondDefinition]).render({ key: definition.key, common: { shop: 'Main' }, recipient: { name: 'Alice', vip: false }, identity: { userId: 'u1' }, channels: ['in-app'] });
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it('enforces rendered output and startup source limits', async () => {
    const outputRegistry = createNotificationTemplateRegistry([{ ...definition, key: 'output-limit', channels: { inApp: { title: 'Title', body: '{{ common.shop }}' } } }]);
    await expect(outputRegistry.render({ key: 'output-limit', common: { shop: 'x'.repeat(10_001) }, recipient: { name: 'Alice', vip: false }, identity: {}, channels: ['in-app'] })).rejects.toThrow('output limit');
    expect(() => createNotificationTemplateRegistry([{ ...definition, key: 'source-limit', channels: { inApp: { title: 'Title', body: 'x'.repeat(1_048_577) } } }])).toThrow('source limit');
  });
});
