import { afterEach, expect, it, vi } from 'vitest';
const { startRuntime, render } = vi.hoisted(() => ({
  startRuntime: vi.fn(() => new Promise(() => {})),
  render: vi.fn(),
}));
vi.mock('@nocobase/app-client', () => ({
  AppClientRoot: () => null,
  resolveAppBase: () => '/crm/',
}));
vi.mock('@nocobase/app-client/runtime', () => ({
  resolveAppRuntime: startRuntime,
}));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render }) }));
vi.mock('../../client/app', () => ({ createApp: vi.fn() }));
vi.mock('../../client/runtime', () => ({ default: {} }));
vi.mock('../../client/startup', () => ({ AppStartupError: () => null }));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});
it('restores the app theme before async startup and React rendering', async () => {
  document.body.innerHTML =
    '<div id="root"><div role="status">Loading</div></div>';
  localStorage.setItem('nocobase:crm:theme:preset', 'ocean');
  localStorage.setItem('nocobase:crm:theme:color-scheme', 'dark');
  startRuntime.mockImplementation(() => {
    expect(document.documentElement).toHaveAttribute('data-theme', 'ocean');
    expect(document.documentElement).toHaveClass('dark');
    return new Promise(() => {});
  });
  await import('../../client/index');
  expect(startRuntime).toHaveBeenCalledOnce();
  expect(render).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]')).toHaveTextContent(
    'Loading',
  );
  expect(document.documentElement).toHaveAttribute('data-theme', 'ocean');
});
