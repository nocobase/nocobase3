// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen } from '@testing-library/react';
import type { AppClient } from '@nocobase/app-sdk';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import filesPageUiExtension from '../registry/page-ui/extension';
import FilesPage from '../registry/page-ui/pages/files-page';
import {
  appFileClient,
  FilesUiProvider,
  useFilesUi,
} from '../registry/provider-ui';

describe('Files page and Provider Registry items', () => {
  it('overrides only the stable Files route component', async () => {
    expect(filesPageUiExtension.routeComponentOverrides).toEqual([
      expect.objectContaining({
        routeId: '@nocobase/app-plugin-files:index',
        componentEntry:
          './client/extensions/nocobase-files-page-ui/pages/files-page',
      }),
    ]);
    const override = filesPageUiExtension.routeComponentOverrides?.[0];
    await expect(override?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    expect(filesPageUiExtension).not.toHaveProperty('routes');
  });

  it('renders an application-owned page with application UI', () => {
    render(<FilesPage />);
    expect(screen.getByRole('heading', { name: 'Files' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'View details' })).toBeVisible();
  });

  it('uses defaults without a Provider and accepts scoped overrides', () => {
    expect(renderHook(() => useFilesUi()).result.current.client).toBe(
      appFileClient,
    );
    const client: AppClient = { request: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FilesUiProvider value={{ client }}>{children}</FilesUiProvider>
    );
    expect(
      renderHook(() => useFilesUi(), { wrapper }).result.current.client,
    ).toBe(client);
  });
});
