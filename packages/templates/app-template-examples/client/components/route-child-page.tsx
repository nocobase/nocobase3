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
 * The two elements are not one element with two jobs. The outer one positions and does not scroll; the inner one
 * scrolls and does not position. A deeper layer resolves `inset-0` against the outer one, so it covers this layer
 * whatever this layer is scrolled to — while a single element doing both would carry that layer away with its own
 * scrolling, out of sight.
 */
export function RouteChildPage({
  children,
  className,
}: RouteChildPageProps): ReactElement {
  return (
    <div className='absolute inset-0 overflow-hidden bg-background'>
      <div className={cn('h-full overflow-y-auto', className)}>{children}</div>
    </div>
  );
}

RouteChildPage.displayName = 'RouteChildPage';
