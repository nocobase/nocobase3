// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import SkillsSettingsPage from '../client/pages/skills-settings-page.js';
import type {
  ManagedSkillDetail,
  ManagedSkillSummary,
} from '../client/skills-management-service.js';
import packageMetadata from '../package.json' with { type: 'json' };

const mocks = vi.hoisted(() => ({ api: { request: vi.fn() } }));
vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useService: () => mocks.api,
}));

const skills: ManagedSkillSummary[] = [
  {
    name: 'analyze-data',
    title: 'Data analysis',
    description: 'Summarize trends',
    tools: [
      {
        name: 'queryRecords',
        title: 'Query records',
        description: 'Read collection records',
        available: true,
      },
      { name: 'missingTool', title: '', description: '', available: false },
    ],
  },
  {
    name: 'draft-document',
    title: '',
    description: 'Write a report',
    tools: [],
  },
];
const detail: ManagedSkillDetail = {
  ...skills[0],
  content:
    '# Analysis guide\n\nUse **evidence** and `queryRecords`.\n\n- Compare trends\n\n```js\n' +
    'longCode'.repeat(100) +
    '\n```\n\n| Column | Value |\n| --- | --- |\n| Wide content | ' +
    'wideValue'.repeat(80) +
    ' |\n\n<script>alert("unsafe")</script>\n\n<img src="x" onerror="alert(1)">\n\n[unsafe link](javascript:alert%281%29)',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function renderPage(locale = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: '@test/app',
  });
  runtime.registerNamespace(packageMetadata.name, locales);
  await runtime.init(locale);
  return render(
    <I18nProvider runtime={runtime}>
      <SkillsSettingsPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.api.request.mockReset().mockResolvedValue({ rows: skills });
});

describe('Skills settings page', () => {
  it('uses the settings shell and a read-only table with actual tool names, loading details only on open', async () => {
    await renderPage();
    const table = await screen.findByRole('table', { name: 'Skills' });
    const heading = screen.getByRole('heading', { name: 'Skills', level: 1 });
    expect(heading.closest('header')?.parentElement).toHaveClass(
      'w-full',
      'space-y-6',
      'p-6',
      'md:p-8',
    );
    expect(
      screen.getByText('Browse skills available to AI employees.'),
    ).toBeVisible();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((node) => node.textContent),
    ).toEqual(['Skill', 'Description', 'Tools']);
    const row = within(table)
      .getByRole('button', { name: 'Data analysis' })
      .closest('tr')!;
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent(
      'queryRecords',
    );
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent(
      'missingTool',
    );
    expect(screen.getByText('analyze-data')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'draft-document' }),
    ).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create|edit|delete|execute/i }),
    ).not.toBeInTheDocument();
    expect(mocks.api.request).toHaveBeenCalledExactlyOnceWith({
      path: 'ai/aiSkills:listAll',
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
  });

  it('searches skill metadata and tool names locally', async () => {
    await renderPage();
    await screen.findByRole('table');
    const search = screen.getByRole('searchbox', { name: 'Search skills' });
    for (const query of [
      ' DATA ANALYSIS ',
      'analyze-data',
      'trends',
      'QUERYRECORDS',
      'Query records',
    ]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getAllByRole('row')).toHaveLength(2);
      expect(
        screen.getByRole('button', { name: 'Data analysis' }),
      ).toBeVisible();
    }
    fireEvent.change(search, { target: { value: 'not-found' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'No skills match your search.',
    );
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(mocks.api.request).toHaveBeenCalledTimes(1);
  });

  it('shows list loading, empty and retry states', async () => {
    const pending = deferred<{ rows: ManagedSkillSummary[] }>();
    mocks.api.request
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ rows: [] });
    await renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading skills…');
    await act(async () => pending.reject(new Error('Unavailable')));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to load skills.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No skills are available.')).toBeVisible();
  });

  it('opens from the row, renders safe Markdown and descriptive tools, and closes with Escape', async () => {
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockResolvedValueOnce(detail);
    await renderPage();
    const title = await screen.findByRole('button', { name: 'Data analysis' });
    fireEvent.click(title.closest('tr')!);
    const dialog = await screen.findByRole('dialog', { name: 'Skill details' });
    expect(
      within(dialog).getByRole('heading', { name: 'Data analysis' }),
    ).toBeVisible();
    expect(dialog).toHaveAccessibleDescription('Summarize trends');
    expect(
      await within(dialog).findByRole('heading', { name: 'Analysis guide' }),
    ).toBeVisible();
    expect(within(dialog).getByText('evidence').tagName).toBe('STRONG');
    expect(dialog.querySelector('pre code')).toHaveTextContent(
      'longCode'.repeat(100),
    );
    expect(dialog.querySelector('script, img, iframe')).toBeNull();
    expect(dialog.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(
      /javascript:/i,
    );
    expect(dialog.querySelector('pre')).toHaveClass('overflow-x-auto');
    expect(within(dialog).getByRole('table').parentElement).toHaveClass(
      'overflow-x-auto',
    );
    expect(
      within(dialog).getByRole('tabpanel', { name: 'Instructions' }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('heading', { name: 'Query records' }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Tools (2)' }));
    const tools = within(dialog).getByRole('tabpanel', { name: 'Tools (2)' });
    expect(
      within(tools).getByRole('heading', { name: 'Query records' }),
    ).toBeVisible();
    expect(within(tools).getByText('queryRecords')).toBeVisible();
    expect(within(tools).getByText('Read collection records')).toBeVisible();
    expect(within(tools).queryByText('Available')).not.toBeInTheDocument();
    expect(within(tools).getByText('Missing')).toBeVisible();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(dialog).toHaveClass(
      'right-0',
      'inset-y-0',
      'h-dvh',
      'max-w-2xl',
      'overflow-hidden',
      'data-starting-style:translate-x-full',
      'motion-reduce:transition-none',
    );
    expect(dialog).not.toHaveClass('left-1/2', 'top-1/2', 'overflow-y-auto');
    const header = within(dialog)
      .getByRole('heading', { name: 'Skill details' })
      .closest('header')!;
    expect(header).toHaveClass('shrink-0');
    expect(header.nextElementSibling).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
      'overscroll-contain',
    );
    expect(within(dialog).getByRole('tablist').parentElement).toHaveClass(
      'sticky',
      'top-0',
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(title).toHaveFocus());
    expect(mocks.api.request).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard tab navigation and returns focus to the skill after closing', async () => {
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockResolvedValueOnce(detail);
    await renderPage();
    const trigger = await screen.findByRole('button', {
      name: 'Data analysis',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Skill details' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(close).toHaveFocus());
    await within(dialog).findByRole('heading', { name: 'Analysis guide' });
    const instructions = within(dialog).getByRole('tab', {
      name: 'Instructions',
    });
    const tools = within(dialog).getByRole('tab', { name: 'Tools (2)' });
    act(() => instructions.focus());
    fireEvent.keyDown(instructions, { key: 'ArrowRight' });
    await waitFor(() => expect(tools).toHaveFocus());
    expect(tools).toHaveAttribute('aria-selected', 'true');
    expect(
      within(dialog).getByRole('tabpanel', { name: 'Tools (2)' }),
    ).toBeVisible();
    fireEvent.keyDown(tools, { key: 'ArrowLeft' });
    await waitFor(() => expect(instructions).toHaveFocus());
    expect(instructions).toHaveAttribute('aria-selected', 'true');
    expect(
      within(dialog).getByRole('heading', { name: 'Analysis guide' }),
    ).toBeVisible();
    fireEvent.click(close);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mocks.api.request).toHaveBeenCalledTimes(2);
  });

  it('keeps long metadata readable and provides a description fallback', async () => {
    const longSkill = {
      ...skills[1],
      name: 'long-identity'.repeat(40),
      title: 'Long title '.repeat(30),
      description: '',
    };
    mocks.api.request
      .mockResolvedValueOnce({ rows: [longSkill] })
      .mockResolvedValueOnce({ ...longSkill, content: '' });
    await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: longSkill.title.trim() }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Skill details' });
    expect(dialog).toHaveAccessibleDescription(
      'Read the skill instructions and review its tools.',
    );
    expect(
      within(dialog).getByRole('heading', { name: longSkill.title.trim() }),
    ).toHaveClass('[overflow-wrap:anywhere]');
    expect(within(dialog).getByText(longSkill.name)).toHaveClass(
      'break-all',
      'font-mono',
    );
    expect(
      await within(dialog).findByText('No instructions are available.'),
    ).toBeVisible();
  });

  it('opens from the accessible title button and retries a failed detail request', async () => {
    const pending = deferred<ManagedSkillDetail>();
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detail);
    await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Data analysis' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Skill details' });
    expect(
      within(dialog).getByRole('heading', { name: 'Skill details' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('tab', { name: 'Instructions' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('status').querySelector('[aria-hidden]'),
    ).not.toBeNull();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Loading skill details…',
    );
    await act(async () => pending.reject(new Error('Unavailable')));
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Unable to load skill details.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(
      await within(dialog).findByRole('heading', { name: 'Analysis guide' }),
    ).toBeVisible();
    expect(mocks.api.request).toHaveBeenNthCalledWith(3, {
      path: 'ai/aiSkills:getDetails',
      method: 'GET',
      query: { name: 'analyze-data' },
      signal: expect.any(AbortSignal),
    });
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores stale detail %s after closing and rapidly opening another skill',
    async (outcome) => {
      const pending = deferred<ManagedSkillDetail>();
      const next = deferred<ManagedSkillDetail>();
      mocks.api.request
        .mockResolvedValueOnce({ rows: skills })
        .mockReturnValueOnce(pending.promise)
        .mockReturnValueOnce(next.promise);
      await renderPage();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Data analysis' }),
      );
      const signal = (
        mocks.api.request.mock.calls[1][0] as { signal: AbortSignal }
      ).signal;
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(signal.aborted).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'draft-document' }));
      const dialog = screen.getByRole('dialog', { name: 'Skill details' });
      expect(
        within(dialog).getByRole('heading', { name: 'draft-document' }),
      ).toBeVisible();
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(detail);
        else pending.reject(new Error('Stale failure'));
      });
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Loading skill details…',
      );
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText('Analysis guide'),
      ).not.toBeInTheDocument();
      await act(async () => next.resolve({ ...skills[1], content: '' }));
      expect(
        within(dialog).getByText('No instructions are available.'),
      ).toBeVisible();
      fireEvent.click(within(dialog).getByRole('tab', { name: 'Tools (0)' }));
      expect(within(dialog).getByText('No tools')).toBeVisible();
    },
  );

  it('cancels on close and unmount without reopening from late responses', async () => {
    const pending = deferred<ManagedSkillDetail>();
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockReturnValueOnce(pending.promise);
    const view = await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Data analysis' }),
    );
    const listSignal = (
      mocks.api.request.mock.calls[0][0] as { signal: AbortSignal }
    ).signal;
    const signal = (
      mocks.api.request.mock.calls[1][0] as { signal: AbortSignal }
    ).signal;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(detail));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
    expect(listSignal.aborted).toBe(true);
  });

  it('cancels a pending detail request when the page unmounts', async () => {
    const pending = deferred<ManagedSkillDetail>();
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockReturnValueOnce(pending.promise);
    const view = await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Data analysis' }),
    );
    const signal = (
      mocks.api.request.mock.calls[1][0] as { signal: AbortSignal }
    ).signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error('Late failure')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels a pending list request on unmount and ignores its completion', async () => {
    const pending = deferred<{ rows: ManagedSkillSummary[] }>();
    mocks.api.request.mockReturnValueOnce(pending.promise);
    const view = await renderPage();
    const signal = (
      mocks.api.request.mock.calls[0][0] as { signal: AbortSignal }
    ).signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ rows: skills }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('starts fresh when reopening the same skill and ignores the previous response', async () => {
    const previous = deferred<ManagedSkillDetail>();
    const current = deferred<ManagedSkillDetail>();
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(current.promise);
    await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Data analysis' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Data analysis' }));
    const dialog = screen.getByRole('dialog', { name: 'Skill details' });
    await act(async () => previous.resolve(detail));
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Loading skill details…',
    );
    expect(
      within(dialog).queryByText('Analysis guide'),
    ).not.toBeInTheDocument();
    await act(async () =>
      current.resolve({ ...detail, content: '# Current instructions' }),
    );
    expect(
      within(dialog).getByRole('heading', { name: 'Current instructions' }),
    ).toBeVisible();
  });

  it('renders Chinese table, dialog loading, error and tool statuses', async () => {
    const pending = deferred<ManagedSkillDetail>();
    mocks.api.request
      .mockResolvedValueOnce({ rows: skills })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detail);
    await renderPage('zh-CN');
    expect(
      await screen.findByRole('columnheader', { name: '工具' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Data analysis' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在加载技能详情…');
    await act(async () => pending.reject(new Error('Unavailable')));
    expect(screen.getByRole('alert')).toHaveTextContent('无法加载技能详情。');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    const dialog = screen.getByRole('dialog', { name: '技能详情' });
    expect(
      await within(dialog).findByRole('heading', { name: 'Analysis guide' }),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('tab', { name: '工具 (2)' }));
    expect(within(dialog).queryByText('可用')).not.toBeInTheDocument();
    expect(within(dialog).getByText('缺失')).toBeVisible();
  });
});
