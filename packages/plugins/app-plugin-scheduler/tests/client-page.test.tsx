// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const mocks = vi.hoisted(() => {
  const request = vi.fn();
  let language: 'en-US' | 'zh-CN' = 'en-US';
  const translations: Readonly<Record<string, string>> = {
    'nav.automation': 'Automation',
    'page.title': 'Scheduled tasks',
    'page.targets.workflow': 'Workflow',
    'page.targets.job': 'Job',
    'page.pagination.previous': 'Previous',
    'page.pagination.next': 'Next',
    'page.pagination.summary': 'Page {{page}} of {{total}}',
    'page.filters.searchLabel': 'Search schedules',
    'page.filters.searchPlaceholder': 'Search name, target type, or schedule…',
    'page.filters.statusLabel': 'Filter by status',
    'page.filters.targetLabel': 'Filter by target type',
    'page.filters.allStatuses': 'All statuses',
    'page.filters.allTargets': 'All target types',
    'page.statuses.active': 'Active',
    'page.statuses.paused': 'Paused',
    'page.statuses.inactive': 'Inactive',
    'page.statuses.targetIssue': 'Target issue',
    'page.columns.name': 'Name',
    'page.columns.target': 'Target',
    'page.columns.scheduleTimezone': 'Schedule / timezone',
    'page.columns.triggered': 'Triggered',
    'page.columns.nextRun': 'Next trigger',
    'page.columns.status': 'Status',
    'page.actions.enable': 'Enable',
    'page.actions.disable': 'Disable',
    'page.loading': 'Loading scheduled tasks…',
    'page.empty': 'No scheduled tasks are defined.',
    'page.noMatches': 'No scheduled tasks match these filters.',
    'page.unavailable': '—',
    'page.invalidSchedule': 'Invalid schedule',
    'page.details.back': 'Back to scheduled tasks',
    'page.details.loading': 'Loading schedule details…',
    'page.details.notFound': 'The scheduled task was not found.',
    'page.details.overview': 'Overview',
    'page.details.triggers': 'Execution records',
    'page.details.schedule': 'Schedule',
    'page.details.frequency': 'Frequency',
    'page.details.timezone': 'Timezone',
    'page.details.nextRun': 'Next run',
    'page.details.lastTrigger': 'Last trigger',
    'page.details.triggerCount': 'Trigger count',
    'page.details.target': 'Execution target',
    'page.details.targetName': 'Target',
    'page.details.targetType': 'Target type',
    'page.details.description': 'Description',
    'page.triggersLoading': 'Loading triggers…',
    'page.triggersEmpty': 'No triggers have started.',
    'page.triggerColumns.timing': 'Started / finished',
    'page.triggerColumns.status': 'Status',
    'page.triggerStatuses.triggered': 'Triggered',
  };
  const chineseTranslations: Readonly<Record<string, string>> = {
    'nav.automation': '自动化',
    'page.title': '定时任务',
    'page.columns.triggered': '已触发',
    'page.filters.searchLabel': '搜索定时任务',
    'page.filters.searchPlaceholder': '搜索名称、目标类型或执行周期…',
    'page.filters.statusLabel': '按状态筛选',
    'page.filters.targetLabel': '按目标类型筛选',
    'page.filters.allStatuses': '全部状态',
    'page.filters.allTargets': '全部目标类型',
    'page.statuses.active': '运行中',
    'page.statuses.paused': '已暂停',
    'page.statuses.inactive': '已失效',
    'page.statuses.targetIssue': '目标异常',
    'page.loading': '正在加载定时任务…',
    'page.empty': '尚未声明定时任务。',
  };
  return {
    request,
    api: { request },
    setLanguage: (nextLanguage: 'en-US' | 'zh-CN') => {
      language = nextLanguage;
    },
    getLanguage: () => language,
    t: (key: string, options?: Readonly<Record<string, unknown>>) => {
      const template =
        (language === 'zh-CN' ? chineseTranslations[key] : translations[key]) ??
        (options?.defaultValue as string | undefined) ??
        key;
      return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
        String(options?.[name] ?? ''),
      );
    },
  };
});

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: Symbol('api-client'),
  useService: () => mocks.api,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: {
      language: mocks.getLanguage(),
      resolvedLanguage: mocks.getLanguage(),
    },
    t: mocks.t,
  }),
}));

import SchedulesPage from '../client/pages/schedules-page.js';
import ScheduleDetailPage from '../client/pages/schedule-detail-page.js';
import { formatCronDescription } from '../client/pages/cron-description.js';
import { formatClientRelativeTime } from '../client/pages/date-time.js';

const schedules = [
  {
    id: 'schedule-1',
    title: 'Daily customer sync',
    description: 'Synchronize active customers',
    cron: '0 0 2 * * *',
    timezone: 'UTC',
    enabled: true,
    lifecycleState: 'active',
    scheduleStatus: 'active',
    runCount: 4,
    completedCount: 3,
    lastRunAt: '2026-09-01T02:00:00.000Z',
    nextRunAt: '2026-09-02T02:00:00.000Z',
    targetType: 'workflow',
    targetState: 'ready',
    targetSummary: {
      targetLabel: 'Customer sync',
      description: 'Published workflow',
      state: 'ready',
    },
  },
  {
    id: 'schedule-2',
    title: 'Archive cleanup',
    cron: '0 0 3 * * 0',
    timezone: 'Asia/Singapore',
    enabled: false,
    lifecycleState: 'active',
    scheduleStatus: 'paused',
    runCount: 2,
    completedCount: 0,
    targetType: 'job',
    targetState: 'ready',
    targetSummary: { targetLabel: 'Cleanup job', state: 'ready' },
  },
] as const;

const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const timeZoneLabelledFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

function renderList(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <SchedulesPage />
    </MemoryRouter>,
  );
}

function renderDetail(
  scheduleId: string = 'schedule-1',
): ReturnType<typeof render> {
  return render(
    <MemoryRouter
      initialEntries={[`/settings/automation/schedules/${scheduleId}`]}
    >
      <Routes>
        <Route
          element={<ScheduleDetailPage />}
          path='/settings/automation/schedules/:scheduleId'
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SchedulesPage', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.setLanguage('en-US');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('describes interval schedules in the active language', () => {
    expect(formatCronDescription('0 0 */2 * * *', 'en-US')).toBe(
      'On the hour, every 2 hours',
    );
    expect(formatCronDescription('0 0 0 */3 * *', 'zh-CN')).toBe(
      '在上午 12:00, 每隔 3 天',
    );
  });

  it('renders a page title and empty state without developer-facing copy', async () => {
    let resolveRequest: ((value: { data: never[] }) => void) | undefined;
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderList();
    expect(screen.getByText('Loading scheduled tasks…')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Scheduled tasks' }),
    ).toBeTruthy();
    expect(screen.getByText('Automation')).toBeTruthy();
    expect(screen.queryByText('Create')).toBeNull();
    expect(screen.queryByText('Read only')).toBeNull();
    expect(screen.queryByText('Read-only code-defined schedules.')).toBeNull();

    resolveRequest?.({ data: [] });
    expect(
      await screen.findByText('No scheduled tasks are defined.'),
    ).toBeTruthy();
  });

  it('renders the plugin-owned Chinese locale through its namespace', async () => {
    mocks.setLanguage('zh-CN');
    mocks.request.mockResolvedValueOnce({ data: schedules });

    renderList();
    expect(await screen.findByText('在上午 02:00')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '定时任务' })).toBeTruthy();
    expect(screen.getByText('自动化')).toBeTruthy();
    expect(screen.queryByText('只读')).toBeNull();
    expect(screen.queryByText('0 0 2 * * *')).toBeNull();
  });

  it('filters schedules by text, status, and target', async () => {
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    await screen.findByText('Daily customer sync');
    // The next trigger shows a local absolute time and no timezone label.
    expect(
      screen.getByText(
        localDateTimeFormatter.format(new Date('2026-09-02T02:00:00.000Z')),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        timeZoneLabelledFormatter.format(new Date('2026-09-02T02:00:00.000Z')),
      ),
    ).toBeNull();
    // The last trigger is relative only, so its exact instant is not rendered.
    expect(
      screen.queryByText(
        localDateTimeFormatter.format(new Date('2026-09-01T02:00:00.000Z')),
      ),
    ).toBeNull();
    expect(screen.queryByText('2026-09-01T02:00:00.000Z')).toBeNull();
    expect(screen.queryByText('2026-09-02T02:00:00.000Z')).toBeNull();
    // The list intentionally has no aggregate statistics panel.
    expect(screen.queryByText('Triggers')).toBeNull();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.getByText('At 02:00 AM')).toBeTruthy();
    expect(screen.queryByText('0 0 2 * * *')).toBeNull();

    // A row names its execution target by kind, and carries no description.
    const syncRow = screen.getByText('Daily customer sync').closest('tr');
    expect(syncRow).not.toBeNull();
    expect(within(syncRow!).getByText('Workflow')).toBeTruthy();
    expect(within(syncRow!).queryByText('Customer sync')).toBeNull();
    const cleanupRow = screen.getByText('Archive cleanup').closest('tr');
    expect(cleanupRow).not.toBeNull();
    expect(within(cleanupRow!).getByText('Job')).toBeTruthy();
    expect(within(cleanupRow!).queryByText('Cleanup job')).toBeNull();
    expect(screen.queryByText('Synchronize active customers')).toBeNull();

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search schedules' }),
      {
        target: { value: 'cleanup' },
      },
    );
    expect(screen.queryByText('Daily customer sync')).toBeNull();
    expect(screen.getByText('Archive cleanup')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      {
        target: { value: 'active' },
      },
    );
    expect(screen.getByText('Daily customer sync')).toBeTruthy();
    expect(screen.queryByText('Archive cleanup')).toBeNull();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      {
        target: { value: 'all' },
      },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Filter by target type' }),
      { target: { value: 'job' } },
    );
    expect(screen.getByText('Archive cleanup')).toBeTruthy();
    expect(screen.queryByText('Daily customer sync')).toBeNull();
  });

  it('links the task title to its dedicated detail page', async () => {
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    const link = await screen.findByRole('link', {
      name: 'Daily customer sync',
    });
    expect(link.getAttribute('href')).toBe(
      '/settings/automation/schedules/schedule-1',
    );
    expect(screen.queryByRole('link', { name: 'View details' })).toBeNull();
    expect(screen.queryByText('Schedule details')).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('paginates the list once it outgrows one page', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...schedules[0],
      id: `schedule-${index + 1}`,
      title: `Task ${index + 1}`,
    }));
    mocks.request.mockResolvedValueOnce({ data: many });
    renderList();

    await screen.findByText('Task 1');
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getByText('Task 10')).toBeTruthy();
    expect(screen.queryByText('Task 11')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Task 11')).toBeTruthy();
    expect(screen.getByText('Task 12')).toBeTruthy();
    expect(screen.queryByText('Task 1')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // Narrowing the list starts again from the first page, and the pager
    // disappears once everything fits on one.
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Task 1' },
    });
    expect(screen.getByText('Task 1')).toBeTruthy();
    expect(screen.getByText('Task 11')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('hides the pager while the list fits on one page', async () => {
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    await screen.findByText('Daily customer sync');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByText('Page 1 of 1')).toBeNull();
  });

  it('merges trigger count and last trigger into one relative column', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    await screen.findByText('Daily customer sync');
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      'Name',
      'Target',
      'Status',
      'Schedule / timezone',
      'Triggered',
      'Next trigger',
    ]);

    const row = screen.getByText('Daily customer sync').closest('tr');
    expect(row).not.toBeNull();
    const triggered = within(row!).getAllByRole('cell')[4];
    expect(triggered?.textContent).toContain('4');
    expect(triggered?.textContent).toContain(
      formatClientRelativeTime(
        '2026-09-01T02:00:00.000Z',
        new Date('2026-09-02T12:00:00.000Z'),
      )!,
    );
    // A schedule that has never triggered still occupies the same cell shape.
    const never = screen.getByText('Archive cleanup').closest('tr');
    expect(within(never!).getAllByRole('cell')[4]?.textContent).toContain('—');
  });

  it('carries the enabled state as a switch of its own, named by the action it performs', async () => {
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    await screen.findByText('Daily customer sync');
    const syncRow = screen.getByText('Daily customer sync').closest('tr');
    expect(syncRow).not.toBeNull();
    const [name, , status] = within(syncRow!).getAllByRole('cell');
    // The title cell carries the link alone; `enabled` is database-owned state
    // an administrator toggles, so it reads as a control rather than a label.
    expect(
      within(name!).getByRole('link', { name: 'Daily customer sync' }),
    ).toBeTruthy();
    expect(within(name!).queryByRole('switch')).toBeNull();
    const enabledSwitch = within(status!).getByRole('switch');
    // The switch is named for what it would do, not for the state it is in.
    expect(enabledSwitch.getAttribute('aria-label')).toBe('Disable');
    expect(enabledSwitch.getAttribute('aria-checked')).toBe('true');

    // A paused schedule reports that state through the same control.
    const cleanupRow = screen.getByText('Archive cleanup').closest('tr');
    const cleanupSwitch = within(cleanupRow!).getByRole('switch');
    expect(cleanupSwitch.getAttribute('aria-label')).toBe('Enable');
    expect(cleanupSwitch.getAttribute('aria-checked')).toBe('false');
  });

  it('navigates to the detail page from the title rather than from the whole row', async () => {
    mocks.request.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve({ data: path === 'schedules' ? schedules : [] }),
    );
    render(
      <MemoryRouter initialEntries={['/settings/automation/schedules']}>
        <Routes>
          <Route
            element={<SchedulesPage />}
            path='/settings/automation/schedules'
          />
          <Route
            element={<ScheduleDetailPage />}
            path='/settings/automation/schedules/:scheduleId'
          />
        </Routes>
      </MemoryRouter>,
    );

    const title = await screen.findByText('Daily customer sync');
    const row = title.closest('tr');
    expect(row).not.toBeNull();
    // The row carries a switch, so a row-wide click target would swallow the
    // toggle. Only the title navigates.
    expect(row?.className).not.toContain('cursor-pointer');
    fireEvent.click(within(row!).getAllByRole('cell')[1]!);
    expect(
      screen.queryByRole('link', { name: 'Back to scheduled tasks' }),
    ).toBeNull();

    fireEvent.click(title);
    expect(
      await screen.findByRole('link', { name: 'Back to scheduled tasks' }),
    ).toBeTruthy();
  });

  it('renders the read-only overview on the dedicated detail route', async () => {
    mocks.request.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve({ data: path === 'schedules' ? schedules : [] }),
    );
    renderDetail();

    const heading = await screen.findByRole('heading', {
      name: 'Daily customer sync',
    });
    expect(screen.getByText('Synchronize active customers')).toBeTruthy();
    expect(screen.queryByText('Schedule details')).toBeNull();
    const header = heading.closest('header');
    expect(header).not.toBeNull();
    expect(within(header!).queryByText('0 0 2 * * *')).toBeNull();
    expect(within(header!).queryByText('UTC')).toBeNull();
    expect(screen.getByText('At 02:00 AM')).toBeTruthy();
    expect(screen.queryByText('0 0 2 * * *')).toBeNull();
    expect(screen.getByText('UTC')).toBeTruthy();
    expect(screen.getByText('Trigger count')).toBeTruthy();
    expect(screen.getByText('Published workflow')).toBeTruthy();
    expect(screen.queryByText('Target state')).toBeNull();
    expect(screen.queryByText('ready')).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Back to scheduled tasks' })
        .getAttribute('href'),
    ).toBe('/settings/automation/schedules');

    expect(await screen.findByText('No triggers have started.')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Execution records' }),
    ).toBeTruthy();

    for (const action of [
      'Create',
      'Edit',
      'Enable',
      'Disable',
      'Run now',
      'Delete',
      'Duplicate',
    ])
      expect(screen.queryByRole('button', { name: action })).toBeNull();
  });

  it('renders trigger timing, status, and reason without internal metadata', async () => {
    mocks.request.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve({
        data:
          path === 'schedules'
            ? [schedules[0]]
            : [
                {
                  id: 'occurrence-1',
                  status: 'triggered',
                  reason: 'accepted',
                  executionCount: 1,
                  startedAt: '2026-09-01T02:00:01.000Z',
                  finishedAt: '2026-09-01T02:00:02.000Z',
                  targetReceipt: { eventKey: 'private-value' },
                },
              ],
      }),
    );
    renderDetail();

    await screen.findByRole('heading', { name: 'Daily customer sync' });
    const status = await screen.findByText('Triggered');
    const trigger = within(status.closest('tr')!);
    expect(trigger.getByText('accepted')).toBeTruthy();
    expect(
      trigger.getByText(
        localDateTimeFormatter.format(new Date('2026-09-01T02:00:01.000Z')),
      ),
    ).toBeTruthy();
    expect(trigger.queryByText('2026-09-01T02:00:01.000Z')).toBeNull();
    expect(screen.queryByText('Run 4')).toBeNull();
    expect(screen.queryByText('Executions')).toBeNull();
    expect(screen.queryByText('Receipt')).toBeNull();
    expect(screen.queryByText('Recorded')).toBeNull();
    expect(screen.queryByText('private-value')).toBeNull();
  });
});
