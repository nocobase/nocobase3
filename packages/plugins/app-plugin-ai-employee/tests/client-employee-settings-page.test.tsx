// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import AISettingsPage from '../client/pages/settings-page.js';

vi.mock('../client/locales/index.js', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('../client/pages/ai-employee-page.js', () => ({
  default: () => <div>Employee content</div>,
}));

describe('standalone AI employee settings', () => {
  it('shows the plural title without redundant navigation for its only tab', async () => {
    const router = createMemoryRouter(
      [{ path: '/settings/ai', Component: AISettingsPage }],
      { initialEntries: ['/settings/ai'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Employee content')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'AI Employees' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByText('employees.pageDescription')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Manage AI employees, LLM services, and MCP services.',
      ),
    ).not.toBeInTheDocument();
  });
});
