import {
  render as renderWithoutToasts,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement } from 'react';

import { ToastHost } from './toast-host.js';

/** Renders inside the stand-in toaster that Hub pages need, as the application's own does. */
export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return renderWithoutToasts(ui, { ...options, wrapper: ToastHost });
}
