/**
 * A model service's own request headers: set, checked and answered (a secret value never), and sent with every request
 * over the service — listing models, chat, embeddings and reranking — beside the user agent. A call to an OpenCode base
 * URL also carries `x-opencode-session`, the conversation's session id or a new one for a call outside any. A local
 * OpenAI-compatible server stands in for the provider, with requests to OpenCode's hosts redirected to it.
 */
import { generateText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import {
  isOpenCodeUrl,
  type CreateModelServiceRequest,
} from '../shared/models.js';
import { createModelGateway } from '../server/online/index.js';
import { headersOf } from '../server/online/providers.js';
import { createHarness, type Harness } from './harness.js';
import { startMockOpenAI, type MockOpenAI } from './mock-openai.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const ADMIN = {
  user: 'admin',
  can: ['agents.services/read', 'agents.services/manage'],
};

/**
 * Sends every request to an OpenCode host to the local mock instead, the way an application pointed at
 * `https://opencode.ai/zen/go/v1` reaches it; returns a function that stops redirecting.
 */
function redirectOpenCode(mock: MockOpenAI): () => void {
  const real = globalThis.fetch;
  const target = new URL(mock.url);
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => {
      const url = new URL(
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input,
      );
      if (
        url.hostname !== 'opencode.ai' &&
        !url.hostname.endsWith('.opencode.ai')
      )
        return real(input as RequestInfo, init);
      const rewritten = `${target.origin}${url.pathname}${url.search}`;
      if (input instanceof Request) {
        const copy = input.clone();
        return real(
          new Request(rewritten, {
            method: copy.method,
            headers: copy.headers,
            body: copy.body,
            signal: copy.signal,
            duplex: 'half',
          } as RequestInit),
        );
      }
      return real(rewritten, init);
    });
  return () => spy.mockRestore();
}

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

  const service = (
    extra: Partial<CreateModelServiceRequest> = {},
  ): CreateModelServiceRequest => ({
    title: 'Team',
    provider: 'openai-compatible',
    baseUrl: mock.url,
    apiKey: 'test-key',
    headers: [
      { name: 'X-Team', value: 'agents' },
      { name: 'X-Tenant-Key', value: 'tenant-secret', secret: true },
    ],
    models: [
      { value: 'mock-model' },
      { value: 'mock-embed', kind: 'embedding' },
      { value: 'mock-rerank', kind: 'rerank' },
    ],
    ...extra,
  });

  const last = () => mock.seen.at(-1)?.headers ?? {};

  it('answers the headers, never a secret value, and seals it', async () => {
    const services = h.services.online.services;
    const created = await services.create(service());
    expect(created).toMatchObject({
      headers: [
        { name: 'X-Team', secret: false, value: 'agents', valueSet: true },
        { name: 'X-Tenant-Key', secret: true, value: null, valueSet: true },
      ],
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

  it('sends them with every request, beside the key and the user agent, and no session header off OpenCode', async () => {
    const services = h.services.online.services;
    await services.create(service());
    const gateway = createModelGateway(services, { maxRetries: 0 });
    const expected = {
      authorization: 'Bearer test-key',
      'x-team': 'agents',
      'x-tenant-key': 'tenant-secret',
      'user-agent': expect.stringMatching(
        new RegExp(
          `^nocobase-agents/${packageMetadata.version.replaceAll('.', '\\.')}`,
          'u',
        ),
      ),
    };

    expect(await services.models({ service: 'team' })).toMatchObject({
      ok: true,
    });
    expect(last()).toMatchObject(expected);
    expect(last()).not.toHaveProperty('x-opencode-session');

    mock.answer({ text: ['ok'] });
    expect(
      await services.check({ service: 'team', model: 'mock-model' }),
    ).toEqual({ ok: true, message: null });
    expect(last()).toMatchObject(expected);

    await gateway.embed({
      model: { modelService: 'team', model: 'mock-embed' },
      values: ['one'],
      source: 'test',
    });
    expect(last()).toMatchObject(expected);

    await gateway.rerank({
      model: { modelService: 'team', model: 'mock-rerank' },
      query: 'one',
      documents: ['one', 'two'],
      source: 'test',
    });
    expect(last()).toMatchObject(expected);

    for await (const event of gateway.stream({
      model: { modelService: 'team', model: 'mock-model' },
      messages: [{ role: 'user', content: 'Hi' }],
    }))
      void event;
    expect(last()).toMatchObject(expected);
    expect(last()).not.toHaveProperty('x-opencode-session');
  });

  it('adds the session header for an OpenCode base URL alone', () => {
    const connection = {
      provider: 'openai-compatible' as const,
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: null,
      headers: { 'X-Team': 'agents' },
    };
    expect(headersOf(connection, 'conversation-session')).toEqual({
      'X-Team': 'agents',
      'x-opencode-session': 'conversation-session',
    });
    expect(headersOf(connection)).toMatchObject({
      'X-Team': 'agents',
      'x-opencode-session': expect.stringMatching(UUID),
    });
    expect(headersOf({ ...connection, baseUrl: mock.url })).toEqual({
      'X-Team': 'agents',
    });
  });

  it('sends a conversation’s session id to an OpenCode base URL, and a new one to each call outside any', async () => {
    const services = h.services.online.services;
    await services.create(
      service({ baseUrl: 'https://opencode.ai/zen/go/v1' }),
    );
    const stop = redirectOpenCode(mock);
    try {
      const gateway = createModelGateway(services, { maxRetries: 0 });
      const model = await gateway.languageModel(
        { modelService: 'team', model: 'mock-model' },
        { session: 'conversation-session' },
      );
      mock.answer({ text: ['ok'] });
      await generateText({ model, prompt: 'One', maxRetries: 0 });
      await generateText({ model, prompt: 'Two', maxRetries: 0 });
      const sessions = mock.seen
        .slice(-2)
        .map((request) => request.headers['x-opencode-session']);
      expect(sessions).toEqual([
        'conversation-session',
        'conversation-session',
      ]);
      expect(last()).toMatchObject({
        authorization: 'Bearer test-key',
        'x-team': 'agents',
      });

      // Outside any conversation, every call gets a new session id.
      await services.check({ service: 'team', model: 'mock-model' });
      const first = last()['x-opencode-session'];
      await services.check({ service: 'team', model: 'mock-model' });
      expect(first).toMatch(UUID);
      expect(last()['x-opencode-session']).toMatch(UUID);
      expect(last()['x-opencode-session']).not.toBe(first);
    } finally {
      stop();
    }
  });

  it('satisfies OpenCode by itself, and shows the provider’s reason verbatim when it cannot', async () => {
    const services = h.services.online.services;
    mock.requireHeader('x-opencode-session');
    // A plain endpoint that wants the header: the provider's own words reach the caller.
    await services.create(service({ title: 'Plain', headers: [] }));
    expect(
      await services.check({ service: 'plain', model: 'mock-model' }),
    ).toEqual({
      ok: false,
      message:
        'Request is missing x-opencode-session and cannot be routed efficiently.',
    });
    // The headers being edited are tried: one carrying the header answers.
    mock.answer({ text: ['ok'] });
    expect(
      await services.check({
        service: 'plain',
        headers: [{ name: 'x-opencode-session', value: 'test-session' }],
        model: 'mock-model',
      }),
    ).toEqual({ ok: true, message: null });
    expect(last()['x-opencode-session']).toBe('test-session');

    // An OpenCode base URL needs no header set: the server sends one.
    const stop = redirectOpenCode(mock);
    try {
      await services.create(
        service({
          title: 'Go',
          baseUrl: 'https://opencode.ai/zen/go/v1',
          headers: [],
        }),
      );
      mock.answer({ text: ['ok'] });
      expect(
        await services.check({ service: 'go', model: 'mock-model' }),
      ).toEqual({ ok: true, message: null });
      expect(last()['x-opencode-session']).toMatch(UUID);
    } finally {
      stop();
    }
  });

  it('keeps a secret value the edit leaves out, and replaces it when given', async () => {
    const services = h.services.online.services;
    await services.create(service());
    mock.answer({ text: ['ok'] });
    // Edited before saving: a secret header without a value is the saved one.
    await services.check({
      service: 'team',
      headers: [{ name: 'x-tenant-key', secret: true }],
      model: 'mock-model',
    });
    expect(last()['x-tenant-key']).toBe('tenant-secret');
    expect(last()).not.toHaveProperty('x-team');

    const kept = await services.update('team', {
      headers: [
        { name: 'X-Tenant-Key', secret: true },
        { name: 'X-Region', value: 'eu' },
      ],
    });
    expect(kept.headers).toEqual([
      { name: 'X-Tenant-Key', secret: true, value: null, valueSet: true },
      { name: 'X-Region', secret: false, value: 'eu', valueSet: true },
    ]);
    await services.check({ service: 'team', model: 'mock-model' });
    expect(last()).toMatchObject({
      'x-tenant-key': 'tenant-secret',
      'x-region': 'eu',
    });

    await services.update('team', {
      headers: [{ name: 'X-Tenant-Key', value: 'other-secret', secret: true }],
    });
    await services.check({ service: 'team', model: 'mock-model' });
    expect(last()['x-tenant-key']).toBe('other-secret');
    expect(last()).not.toHaveProperty('x-region');

    // Untouched by an edit that leaves the headers out.
    await services.update('team', { title: 'Team 2' });
    await services.check({ service: 'team', model: 'mock-model' });
    expect(last()['x-tenant-key']).toBe('other-secret');

    expect((await services.update('team', { headers: [] })).headers).toEqual(
      [],
    );
    const stored = await h.database
      .connection()
      .repository<{ headersEncrypted: string | null }>('agModelServices')
      .findMany({});
    expect(stored[0]?.headersEncrypted).toBeNull();
  });

  it('refuses headers HTTP or the credentials decide, names that are not tokens, twice the same one and a secret without a value', async () => {
    const services = h.services.online.services;
    const refused = async (patch: Record<string, unknown>) =>
      expect(services.create({ ...service(), ...patch })).rejects.toMatchObject(
        {
          code: 'INVALID_REQUEST',
        },
      );
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
    await refused({
      headers: Array.from({ length: 21 }, (_, index) => ({
        name: `X-H${index}`,
        value: 'x',
      })),
    });
    // Over HTTP, as the route answers it.
    const answer = await h.request('POST', '/agents/services', {
      ...ADMIN,
      body: { ...service(), headers: [{ name: 'Authorization', value: 'x' }] },
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
