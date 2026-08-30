import { render, screen } from '@testing-library/react';
import type { AppClient } from '@nocobase/app-sdk';
import { describe, expect, it, vi } from 'vitest';

import { SkillsExampleNotice } from '../../client/components/skills-example-notice.tsx';
import type { LoadSkillsExampleNotice } from '../../client/components/skills-example-notice-data.ts';
import { loadSkillsExampleNotice } from '../../client/components/skills-example-notice-data.ts';

describe('Plugin Skills example integration', () => {
  it('uses the API path documented by the synchronized Skill', async () => {
    const paths: string[] = [];
    const appClient: AppClient = {
      request<T>(path: string): Promise<T> {
        paths.push(path);
        return Promise.resolve({
          description: 'Loaded from the plugin.',
          title: 'Plugin Notice',
          tone: 'info',
        } as T);
      },
    };

    await expect(loadSkillsExampleNotice(appClient)).resolves.toMatchObject({
      title: 'Plugin Notice',
    });
    expect(paths).toEqual(['skills-example/notice']);
  });

  it('renders the plugin component with data loaded by the App', async () => {
    const loadNotice: LoadSkillsExampleNotice = vi.fn().mockResolvedValue({
      description: 'Provided through the documented plugin contract.',
      title: 'App-owned integration',
      tone: 'success',
    });

    render(<SkillsExampleNotice loadNotice={loadNotice} />);

    expect(screen.getByText('Loading notice…')).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: 'App-owned integration' }),
    ).toBeVisible();
    expect(
      screen.getByText('Provided through the documented plugin contract.'),
    ).toBeVisible();
    expect(loadNotice).toHaveBeenCalledOnce();
  });

  it('shows an observable request failure', async () => {
    const loadNotice: LoadSkillsExampleNotice = vi
      .fn()
      .mockRejectedValue(new Error('Notice is unavailable.'));

    render(<SkillsExampleNotice loadNotice={loadNotice} />);

    expect(await screen.findByText('Notice is unavailable.')).toBeVisible();
  });
});
