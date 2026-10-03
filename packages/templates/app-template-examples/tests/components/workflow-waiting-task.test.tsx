import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope, APP_NS } from '@nocobase/i18n/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import enUS from '../../client/locales/en-US.ts';
import TaskPage from '../../client/pages/workflow-waiting-tasks/task.tsx';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request }),
  useToaster: () => ({ show: vi.fn() }),
}));

const task = {
  id: 1,
  runId: '42',
  quotationId: 'Q-100',
  totalCents: 50000,
  route: 'standard',
  status: 'pending',
  waitStatus: 'pending',
  resumeRequestId: null,
  resumeRequest: null,
  reviewerId: null,
  confirmedBy: null,
  decision: null,
  comment: null,
  createdAt: '2026-09-30T00:00:00Z',
  submittedAt: null,
};

beforeEach(() => request.mockReset());

async function mount() {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
    applicationNamespace: '@nocobase/app-template-examples',
  });
  runtime.registerApplicationNamespace('@nocobase/app-template-examples', {
    'en-US': () => Promise.resolve({ default: enUS }),
  });
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <NamespaceScope ns={APP_NS}>
          <MemoryRouter initialEntries={['/workflow/waiting-tasks/1']}>
            <Routes>
              <Route
                path='/workflow/waiting-tasks/:id'
                element={<TaskPage />}
              />
            </Routes>
          </MemoryRouter>
        </NamespaceScope>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

it('submits the decision and comment while the reviewer identity comes from the server', async () => {
  let submitted = false;
  request.mockImplementation(async ({ method }: { method?: string } = {}) => {
    if (method === 'POST') {
      submitted = true;
      return {
        data: {
          ...task,
          status: 'submitted',
          confirmedBy: 'Admin',
          decision: 'approved',
          comment: 'Checked',
        },
      };
    }
    return {
      data: submitted
        ? {
            ...task,
            status: 'submitted',
            confirmedBy: 'Admin',
            decision: 'approved',
            comment: 'Checked',
          }
        : task,
      currentReviewer: { id: 'user-1', name: 'Admin' },
    };
  });
  await mount();
  expect(await screen.findByText('Q-100')).toBeVisible();
  expect(screen.getByText('Admin')).toBeVisible();
  fireEvent.click(screen.getByRole('combobox', { name: 'Decision' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Approved' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Checked' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit decision' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'quotation-review-tasks/1/submit',
        method: 'POST',
        json: { decision: 'approved', comment: 'Checked' },
      }),
    ),
  );
  expect(
    await screen.findByText(
      'Decision recorded. Check the processing result for its final outcome.',
    ),
  ).toBeVisible();
});

it('does not offer submission when the workflow wait has ended', async () => {
  request.mockResolvedValue({
    data: { ...task, waitStatus: 'run-ended' },
    currentReviewer: { id: 'user-1', name: 'Admin' },
  });
  await mount();
  expect(
    await screen.findByText(
      'The wait node is not currently available for submission.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Submit decision' }),
  ).not.toBeInTheDocument();
});

it.each([
  ['queued', null, 'Waiting to be applied'],
  ['processing', null, 'Applying decision'],
  ['consumed', null, 'Decision applied'],
  ['rejected', 'run-ended', 'Decision could not be applied'],
  ['not-found', null, 'Submission record missing'],
])(
  'shows the persisted submission outcome %s',
  async (status, reason, label) => {
    request.mockResolvedValue({
      data: {
        ...task,
        status: 'submitted',
        resumeRequestId: '12345',
        resumeRequest: {
          status,
          ...(status === 'not-found' ? {} : { reason }),
        },
        confirmedBy: 'Admin',
        decision: 'approved',
        comment: 'Checked',
      },
      currentReviewer: { id: 'user-1', name: 'Admin' },
    });
    await mount();
    expect(
      await screen.findByText(`Processing result: ${label}`),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit decision' }),
    ).not.toBeInTheDocument();
    if (status === 'rejected') {
      expect(
        screen.getByText(
          'The workflow run ended before this decision was applied.',
        ),
      ).toBeVisible();
    }
  },
);

it('refreshes an accepted decision to show its final result', async () => {
  let applied = false;
  request.mockImplementation(async () => ({
    data: {
      ...task,
      status: 'submitted',
      resumeRequestId: '12345',
      resumeRequest: { status: applied ? 'consumed' : 'queued', reason: null },
      confirmedBy: 'Admin',
      decision: 'approved',
    },
    currentReviewer: { id: 'user-1', name: 'Admin' },
  }));
  await mount();
  expect(
    await screen.findByText('Processing result: Waiting to be applied'),
  ).toBeVisible();
  applied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(
    await screen.findByText('Processing result: Decision applied'),
  ).toBeVisible();
});
