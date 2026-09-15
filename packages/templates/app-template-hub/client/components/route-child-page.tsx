import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface RouteChildPageProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * A child page, laid over the page that opened it.
 *
 * It is the third way a child route can present itself, beside `RouteDialog` and `RouteDrawer`: those float in the
 * middle or at the side, this one covers the content area. Because it covers rather than replaces, the page beneath
 * keeps its DOM — a draft being typed, a scroll position — and gets it back when this layer closes.
 *
 * Unlike the other two it is deliberately **not** modal. It does not portal out of the content area, trap focus, or
 * mark the application inert, because the user is still on a page of the application and must be able to reach the
 * sidebar. What closes it is the breadcrumb above it, or the browser's back button — not an X or Escape.
 *
 * It positions itself against the nearest positioned ancestor, which is the layout's `<main>`. Nesting works
 * without a stacking order: this element is itself positioned, so a deeper layer covers it the same way.
 */
export function RouteChildPage({
  children,
  className,
}: RouteChildPageProps): ReactElement {
  return (
    <div
      className={cn(
        'absolute inset-0 overflow-y-auto bg-background',
        className,
      )}
    >
      {children}
    </div>
  );
}

RouteChildPage.displayName = 'RouteChildPage';
