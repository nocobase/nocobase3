import { Dialog } from '@base-ui/react/dialog';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export interface LayoutSidebarProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  'aria-label': string;
  desktopState: 'expanded' | 'collapsed' | 'hidden';
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}
// Match Tailwind's default md breakpoint; theme spacing does not change breakpoints.
const desktopQuery = '(min-width: 768px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function getSnapshot() {
  return window.matchMedia(desktopQuery).matches;
}

export function LayoutSidebar({
  children,
  className,
  style,
  id,
  'aria-label': label,
  desktopState,
  mobileOpen,
  onMobileOpenChange,
}: LayoutSidebarProps) {
  const desktop = useSyncExternalStore(subscribe, getSnapshot, () => false);
  // A stable local portal keeps the sidebar in the layout and preserves one child tree across viewport changes.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (desktop && mobileOpen) onMobileOpenChange(false);
  }, [desktop, mobileOpen, onMobileOpenChange]);
  const open = desktop ? desktopState !== 'hidden' : mobileOpen;
  return (
    <div ref={setHost} className='contents'>
      <Dialog.Root
        open={open}
        modal={!desktop}
        disablePointerDismissal={desktop}
        onOpenChange={(value) => {
          if (!desktop) onMobileOpenChange(value);
        }}
      >
        {host ? (
          <Dialog.Portal container={host} keepMounted className='contents'>
            {!desktop ? (
              <Dialog.Backdrop className='fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 data-closed:opacity-0 motion-reduce:transition-none' />
            ) : null}
            <Dialog.Popup
              render={<aside />}
              role={desktop ? 'complementary' : 'dialog'}
              aria-label={label}
              aria-modal={desktop ? undefined : true}
              id={id}
              initialFocus={!desktop}
              finalFocus={!desktop}
              inert={!open}
              aria-hidden={!open || undefined}
              style={style}
              className={cn(
                'flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground outline-none transition-[width,transform] duration-200 motion-reduce:transition-none',
                desktop
                  ? 'sticky top-0 h-svh'
                  : 'fixed inset-y-0 left-0 z-50 data-closed:-translate-x-full',
                desktop && desktopState === 'collapsed' && 'w-16',
                desktop && desktopState === 'hidden' && 'hidden',
                className,
              )}
            >
              {children}
            </Dialog.Popup>
          </Dialog.Portal>
        ) : null}
      </Dialog.Root>
    </div>
  );
}
