import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { Bot } from 'lucide-react';
import { expect, test } from 'vitest';
import settings from '../client/settings.ts';

test('groups employees, conversations, and standalone services as sibling pages', () => {
  expect(settings).toMatchObject({
    parent: 'settings',
    routes: [
      {
        name: 'aiGroup',
        navigation: { title: 'AI', icon: Bot },
        children: [
          {
            name: 'ai',
            path: '/ai',
            navigation: { title: 'AI Employees' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiSkills',
            path: '/ai/skills',
            navigation: { title: 'Skills' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiTools',
            path: '/ai/tools',
            navigation: { title: 'tools.title' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiConversations',
            path: '/ai/conversations',
            navigation: { title: 'Conversations' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiLLMServices',
            path: '/ai/llm-services',
            navigation: { title: 'LLM services' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiMCPServices',
            path: '/ai/mcp-services',
            navigation: { title: 'MCP services' },
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
          {
            name: 'aiSettings',
            path: '/ai/settings',
            authz: {
              resource: { type: 'page', id: 'ai.settings' },
              action: 'access',
            },
            componentLoader: expect.any(Function),
          },
        ],
      },
    ],
  });
  expect(settings.routes).toHaveLength(1);
  expect(settings.routes[0]).not.toHaveProperty('path');
  expect(settings.routes[0]).not.toHaveProperty('componentLoader');
  expect(settings.routes[0]?.children).toHaveLength(7);
  for (const child of settings.routes[0]?.children ?? []) {
    expect(child).not.toHaveProperty('children');
  }
  expect(settings.routes[0]?.children?.[6]).not.toHaveProperty('navigation');
});

test('resolves the AI navigation group without changing page URLs or identities', () => {
  const resolved = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-ai-employee', routes: settings },
  ]);
  expect(resolved.settingsRouteTree).toMatchObject([
    {
      id: 'aiGroup',
      navigation: { title: 'AI', icon: Bot },
      children: [
        { id: 'ai', path: '/settings/ai' },
        { id: 'aiSkills', path: '/settings/ai/skills' },
        { id: 'aiTools', path: '/settings/ai/tools' },
        { id: 'aiConversations', path: '/settings/ai/conversations' },
        { id: 'aiLLMServices', path: '/settings/ai/llm-services' },
        { id: 'aiMCPServices', path: '/settings/ai/mcp-services' },
        { id: 'aiSettings', path: '/settings/ai/settings' },
      ],
    },
  ]);
  expect(
    resolved.settings.map(({ id, path, title, navigation, authz }) => ({
      id,
      path,
      title,
      navigation,
      authz,
    })),
  ).toEqual([
    {
      id: 'ai',
      path: '/settings/ai',
      title: 'AI Employees',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiSkills',
      path: '/settings/ai/skills',
      title: 'Skills',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiTools',
      path: '/settings/ai/tools',
      title: 'tools.title',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiConversations',
      path: '/settings/ai/conversations',
      title: 'Conversations',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiLLMServices',
      path: '/settings/ai/llm-services',
      title: 'LLM services',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiMCPServices',
      path: '/settings/ai/mcp-services',
      title: 'MCP services',
      navigation: true,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
    {
      id: 'aiSettings',
      path: '/settings/ai/settings',
      title: 'aiSettings',
      navigation: false,
      authz: {
        resource: { type: 'page', id: 'ai.settings' },
        action: 'access',
      },
    },
  ]);
});
