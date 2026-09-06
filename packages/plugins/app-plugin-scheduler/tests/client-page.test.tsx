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
    'page.title': 'Scheduled tasks',
    'page.description': 'Read-only code-defined schedules.',
    'page.readOnly': 'Read only',
    'page.summary.total': 'Total schedules',
    'page.summary.active': 'Active schedules',
    'page.summary.triggers': 'Triggers',
    'page.filters.searchLabel': 'Search schedules',
    'page.filters.searchPlaceholder': 'Search name, target, or schedule…',
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
    'page.columns.triggers': 'Triggers',
    'page.columns.lastTrigger': 'Last trigger',
    'page.columns.nextRun': 'Next run',
    'page.columns.status': 'Status',
    'page.loading': 'Loading scheduled tasks…',
    'page.empty': 'No scheduled tasks are defined.',
    'page.noMatches': 'No scheduled tasks match these filters.',
    'page.unavailable': '—',
    'page.invalidSchedule': 'Invalid schedule',
    'page.details.back': 'Back to scheduled tasks',
    'page.details.loading': 'Loading schedule details…',
    'page.details.notFound': 'The scheduled task was not found.',
    'page.details.overview': 'Overview',
    'page.details.triggers': 'Triggers',
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
    'page.triggersHelp':
      'Triggered means the target accepted the request; it does not mean downstream work completed.',
    'page.triggersLoading': 'Loading triggers…',
    'page.triggersEmpty': 'No triggers have started.',
    'page.triggerColumns.scheduledFor': 'Scheduled for',
    'page.triggerColumns.timing': 'Started / finished',
    'page.triggerColumns.status': 'Status',
    'page.triggerStatuses.triggered': 'Triggered',
  };
  const chineseTranslations: Readonly<Record<string, string>> = {
    'page.title': '定时任务',
    'page.description': '只读展示代码声明的定时任务及其触发记录。',
    'page.readOnly': '只读',
    'page.summary.total': '定时任务总数',
    'page.summary.active': '运行中的任务',
    'page.summary.triggers': '触发次数',
    'page.filters.searchLabel': '搜索定时任务',
    'page.filters.searchPlaceholder': '搜索名称、目标或执行周期…',
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
  appApiClientToken: Symbol('app-api-client'),
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
    lastRunAt: '2026-09-01T02:00:00.000Z',
    nextRunAt: '2026-09-02T02:00:00.000Z',
    targetType: 'workflow',
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
    targetType: 'job',
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
  afterEach(cleanup);

  it('describes interval schedules in the active language', () => {
    expect(formatCronDescription('0 0 */2 * * *', 'en-US')).toBe(
      'On the hour, every 2 hours',
    );
    expect(formatCronDescription('0 0 0 */3 * *', 'zh-CN')).toBe(
      '在上午 12:00, 每隔 3 天',
    );
  });

  it('renders polished loading and empty read-only states', async () => {
    let resolveRequest: ((value: { data: never[] }) => void) | undefined;
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderList();
    expect(screen.getByText('Loading scheduled tasks…')).toBeTruthy();
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.queryByText('Create')).toBeNull();

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
    expect(screen.getByText('只读')).toBeTruthy();
    expect(screen.queryByText('0 0 2 * * *')).toBeNull();
  });

  it('shows summaries and filters schedules by text, status, and target', async () => {
    mocks.request.mockResolvedValueOnce({ data: schedules });
    renderList();

    await screen.findByText('Daily customer sync');
    expect(
      screen.getByText(
        localDateTimeFormatter.format(new Date('2026-09-01T02:00:00.000Z')),
      ),
    ).toBeTruthy();
    expect(screen.queryByText('2026-09-01T02:00:00.000Z')).toBeNull();
    const summaries = screen.getAllByText('6');
    expect(summaries).toHaveLength(1);
    expect(screen.getByText('Active schedules')).toBeTruthy();
    expect(screen.getByText('At 02:00 AM')).toBeTruthy();
    expect(screen.queryByText('0 0 2 * * *')).toBeNull();

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

  it('renders the read-only overview on the dedicated detail route', async () => {
    mocks.request.mockImplementation((path: string) =>
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

    fireEvent.click(screen.getByRole('tab', { name: /Triggers/ }));
    expect(await screen.findByText('No triggers have started.')).toBeTruthy();
    expect(
      screen.getByText(
        'Triggered means the target accepted the request; it does not mean downstream work completed.',
      ),
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
    mocks.request.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === 'schedules'
            ? [schedules[0]]
            : [
                {
                  id: 'occurrence-1',
                  scheduledFor: '2026-09-01T02:00:00.000Z',
                  runNumber: 4,
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
    fireEvent.click(screen.getByRole('tab', { name: /Triggers/ }));
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
