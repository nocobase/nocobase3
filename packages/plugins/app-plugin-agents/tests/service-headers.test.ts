/**
 * A model service's own request headers and its session header: set, checked and answered (a secret value never),
 * and sent with every request over the service — listing models, chat, embeddings and reranking — beside the user
 * agent, with a local OpenAI-compatible server standing in for the provider (and for OpenCode Go, which refuses a
 * request without its session header).
 */
import { generateText } from 'ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import { isOpenCodeUrl } from '../shared/models.js';
import { createModelGateway } from '../server/online/index.js';
import { createHarness, type Harness } from './harness.js';
import { startMockOpenAI, type MockOpenAI } from './mock-openai.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const ADMIN = {
  user: 'admin',
  can: ['agents.services/read', 'agents.services/manage'],
};

describe('model service headers', () => {
  let h: Harness;
  let mock: MockOpenAI;

  beforeEach(async () => {
    mock = await startMockOpenAI();
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
    await mock.close();
  });

  const go = () => ({
    title: 'Go',
    provider: 'openai-compatible' as const,
    baseUrl: mock.url,
    apiKey: 'test-key',
    headers: [
      { name: 'X-Team', value: 'agents' },
      { name: 'X-Tenant-Key', value: 'tenant-secret', secret: true },
    ],
    sessionHeader: 'x-opencode-session',
    models: [
      { value: 'mock-model' },
      { value: 'mock-embed', kind: 'embedding' as const },
      { value: 'mock-rerank', kind: 'rerank' as const },
    ],
  });

  const last = () => mock.seen.at(-1)?.headers ?? {};

  it('answers the headers, never a secret value, and seals it', async () => {
    const services = h.services.online.services;
    const created = await services.create(go());
    expect(created).toMatchObject({
      headers: [
        { name: 'X-Team', secret: false, value: 'agents', valueSet: true },
        { name: 'X-Tenant-Key', secret: true, value: null, valueSet: true },
      ],
      sessionHeader: 'x-opencode-session',
    });
    expect(JSON.stringify(await services.list())).not.toContain(
      'tenant-secret',
    );
    const stored = await h.database
      .connection()
      .repository<{ headers: unknown; headersEncrypted: string }>(
        'agModelServices',
      )
      .findMany({});
    expect(JSON.stringify(stored)).not.toContain('tenant-secret');
    expect(stored[0]?.headersEncrypted).toEqual(expect.any(String));
    const listed = await h.request('GET', '/agents/services', ADMIN);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain('tenant-secret');
  });

  it('sends them with every request, beside the key and the user agent', async () => {
    const services = h.services.online.services;
    await services.create(go());
    const gateway = createModelGateway(services, { maxRetries: 0 });
    const expected = {
      authorization: 'Bearer test-key',
      'x-team': 'agents',
      'x-tenant-key': 'tenant-secret',
      'x-opencode-session': expect.stringMatching(UUID),
      'user-agent': expect.stringMatching(
        new RegExp(
          `^nocobase-agents/${packageMetadata.version.replaceAll('.', '\\.')}`,
          'u',
        ),
      ),
    };

    expect(await services.models({ service: 'go' })).toMatchObject({
      ok: true,
    });
    expect(last()).toMatchObject(expected);

    mock.answer({ text: ['ok'] });
    expect(
      await services.check({ service: 'go', model: 'mock-model' }),
    ).toEqual({ ok: true, message: null });
    expect(last()).toMatchObject(expected);

    await gateway.embed({
      model: { modelService: 'go', model: 'mock-embed' },
      values: ['one'],
      source: 'test',
    });
    expect(last()).toMatchObject(expected);

    await gateway.rerank({
      model: { modelService: 'go', model: 'mock-rerank' },
      query: 'one',
      documents: ['one', 'two'],
      source: 'test',
    });
    expect(last()).toMatchObject(expected);

    for await (const event of gateway.stream({
      model: { modelService: 'go', model: 'mock-model' },
      messages: [{ role: 'user', content: 'Hi' }],
    }))
      void event;
    expect(last()).toMatchObject(expected);
  });

  it('sends a run its conversation’s session id on every call, and a new one to each call outside any', async () => {
    const services = h.services.online.services;
    await services.create(go());
    const gateway = createModelGateway(services, { maxRetries: 0 });
    const model = await gateway.languageModel(
      { modelService: 'go', model: 'mock-model' },
      { session: 'conversation-session' },
    );
    mock.answer({ text: ['ok'] });
    await generateText({ model, prompt: 'One', maxRetries: 0 });
    await generateText({ model, prompt: 'Two', maxRetries: 0 });
    const sessions = mock.seen
      .slice(-2)
      .map((request) => request.headers['x-opencode-session']);
    expect(sessions).toEqual(['conversation-session', 'conversation-session']);

    await services.check({ service: 'go', model: 'mock-model' });
    const first = last()['x-opencode-session'];
    await services.check({ service: 'go', model: 'mock-model' });
    expect(first).toMatch(UUID);
    expect(last()['x-opencode-session']).toMatch(UUID);
    expect(last()['x-opencode-session']).not.toBe(first);

    // A service without a session header sends none.
    await services.update('go', { sessionHeader: null });
    await services.check({ service: 'go', model: 'mock-model' });
    expect(last()).not.toHaveProperty('x-opencode-session');
  });

  it('tries the headers being edited, and says what OpenCode said without them', async () => {
    const services = h.services.online.services;
    mock.requireHeader('x-opencode-session');
    await services.create({ ...go(), sessionHeader: null, headers: [] });
    // The provider's reason, as it gave it.
    expect(
      await services.check({ service: 'go', model: 'mock-model' }),
    ).toEqual({
      ok: false,
      message:
        'Request is missing x-opencode-session and cannot be routed efficiently.',
    });
    mock.answer({ text: ['ok'] });
    expect(
      await services.check({
        service: 'go',
        sessionHeader: 'x-opencode-session',
        model: 'mock-model',
      }),
    ).toEqual({ ok: true, message: null });
    expect(await services.models({ service: 'go' })).toMatchObject({
      ok: true,
    });
  });

  it('keeps a secret value the edit leaves out, and replaces it when given', async () => {
    const services = h.services.online.services;
    await services.create(go());
    mock.answer({ text: ['ok'] });
    // Edited before saving: a secret header without a value is the saved one.
    await services.check({
      service: 'go',
      headers: [{ name: 'x-tenant-key', secret: true }],
      model: 'mock-model',
    });
    expect(last()['x-tenant-key']).toBe('tenant-secret');
    expect(last()).not.toHaveProperty('x-team');

    const kept = await services.update('go', {
      headers: [
        { name: 'X-Tenant-Key', secret: true },
        { name: 'X-Region', value: 'eu' },
      ],
    });
    expect(kept.headers).toEqual([
      { name: 'X-Tenant-Key', secret: true, value: null, valueSet: true },
      { name: 'X-Region', secret: false, value: 'eu', valueSet: true },
    ]);
    await services.check({ service: 'go', model: 'mock-model' });
    expect(last()).toMatchObject({
      'x-tenant-key': 'tenant-secret',
      'x-region': 'eu',
    });

    await services.update('go', {
      headers: [{ name: 'X-Tenant-Key', value: 'other-secret', secret: true }],
    });
    await services.check({ service: 'go', model: 'mock-model' });
    expect(last()['x-tenant-key']).toBe('other-secret');
    expect(last()).not.toHaveProperty('x-region');

    // Untouched by an edit that leaves the headers out.
    await services.update('go', { title: 'Go 2' });
    await services.check({ service: 'go', model: 'mock-model' });
    expect(last()['x-tenant-key']).toBe('other-secret');

    expect((await services.update('go', { headers: [] })).headers).toEqual([]);
    const stored = await h.database
      .connection()
      .repository<{ headersEncrypted: string | null }>('agModelServices')
      .findMany({});
    expect(stored[0]?.headersEncrypted).toBeNull();
  });

  it('refuses headers HTTP or the credentials decide, names that are not tokens, twice the same one and a secret without a value', async () => {
    const services = h.services.online.services;
    const refused = async (patch: Record<string, unknown>) =>
      expect(services.create({ ...go(), ...patch })).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
    for (const name of ['Authorization', 'x-api-key', 'User-Agent', 'Host'])
      await refused({ headers: [{ name, value: 'x' }] });
    await refused({ headers: [{ name: 'Bad Name', value: 'x' }] });
    await refused({ headers: [{ name: 'X-A', value: 'one\r\nX-B: two' }] });
    await refused({
      headers: [
        { name: 'X-A', value: 'one' },
        { name: 'x-a', value: 'two' },
      ],
    });
    await refused({ headers: [{ name: 'X-A', secret: true }] });
    await refused({ headers: [{ name: 'X-A', value: '' }] });
    await refused({ sessionHeader: 'authorization' });
    await refused({ sessionHeader: 'x-team' });
    await refused({
      headers: Array.from({ length: 21 }, (_, index) => ({
        name: `X-H${index}`,
        value: 'x',
      })),
    });
    // Over HTTP, as the route answers it.
    const answer = await h.request('POST', '/agents/services', {
      ...ADMIN,
      body: { ...go(), headers: [{ name: 'Authorization', value: 'x' }] },
    });
    expect(answer.status).toBe(400);
    expect(await services.list()).toEqual([]);
  });

  it('knows OpenCode’s base URLs', () => {
    expect(isOpenCodeUrl('https://opencode.ai/zen/go/v1')).toBe(true);
    expect(isOpenCodeUrl('https://api.opencode.ai/v1')).toBe(true);
    expect(isOpenCodeUrl('https://notopencode.ai/v1')).toBe(false);
    expect(isOpenCodeUrl('not a url')).toBe(false);
    expect(isOpenCodeUrl(null)).toBe(false);
  });
});
