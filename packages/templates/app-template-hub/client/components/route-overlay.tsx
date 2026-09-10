import {
  createContext,
  useContext,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Outlet, useLocation, useNavigate, type To } from 'react-router';
import {
  Dialog,
  DialogOverlay,
  DialogClose,
  DialogPortal,
  DialogDescription,
  DialogTitle,
} from './ui/dialog';
import { RouteOverlayContext } from './use-route-overlay';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useTranslation } from '@nocobase/i18n/client';
import { XIcon } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface RouteOverlayProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeTo?: To;
  beforeClose?: () => boolean | Promise<boolean>;
  className?: string;
}

// Private focus fallback for direct nested URLs that have no trigger element.
const ParentPopupContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

/** Application-owned presentation; route registration stays unchanged. */
export function RouteOverlay({
  title,
  description,
  children,
  footer,
  closeTo,
  beforeClose,
  className,
  drawer = false,
}: RouteOverlayProps & { drawer?: boolean }) {
  const { t } = useTranslation();
  const parentPopup = useContext(ParentPopupContext);
  const popupRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const [closingLocation, setClosingLocation] = useState<
    typeof location | null
  >(null);
  const isClosing = closingLocation === location;
  const pendingRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);

  // A still-mounted parent can change location while its confirmation is pending.
  // Invalidate that request as well as requests from an unmounted route.
  useLayoutEffect(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    return () => {
      generationRef.current += 1;
    };
  }, [location]);

  const close = useCallback((): Promise<void> => {
    if (pendingRef.current) return pendingRef.current;
    const requestGeneration = generationRef.current;
    setClosingLocation(location);
    const request = Promise.resolve()
      .then(async () => {
        const allowed = beforeClose ? await beforeClose() : true;
        if (allowed && generationRef.current === requestGeneration) {
          await navigate(
            closeTo ?? { pathname: '..', search: location.search, hash: '' },
            { relative: 'route', replace: true },
          );
        }
      })
      .finally(() => {
        if (generationRef.current === requestGeneration) {
          pendingRef.current = null;
          setClosingLocation(null);
        }
      });
    pendingRef.current = request;
    return request;
  }, [beforeClose, closeTo, location, navigate]);
  const value = useMemo(() => ({ close, isClosing }), [close, isClosing]);

  return (
    <RouteOverlayContext.Provider value={value}>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open)
            void close().catch((error: unknown) => {
              console.error('Failed to close route overlay', error);
            });
        }}
      >
        <DialogPortal>
          {/* Each nested panel needs its own backdrop above its parent panel. */}
          <DialogOverlay forceRender />
          <DialogPrimitive.Popup
            ref={popupRef}
            finalFocus={() => {
              const previous = previousFocusRef.current;
              if (parentPopup?.current) {
                return previous?.isConnected &&
                  parentPopup.current.contains(previous)
                  ? previous
                  : parentPopup.current;
              }
              return true;
            }}
            className={cn(
              'fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-popover-foreground shadow-lg outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl',
              // The viewport constraints are deliberate; all ordinary styling uses theme tokens.
              drawer &&
                'top-0 right-0 left-auto h-svh max-h-svh w-full max-w-full translate-x-0 translate-y-0 rounded-none sm:max-w-xl data-open:slide-in-from-right data-open:zoom-in-100',
              className,
            )}
          >
            <header className='shrink-0 space-y-2 border-b p-4 pr-12'>
              <DialogTitle>{title}</DialogTitle>
              {description != null && (
                <DialogDescription>{description}</DialogDescription>
              )}
            </header>
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>{children}</div>
            {footer != null && (
              <footer className='flex shrink-0 flex-wrap justify-end gap-2 border-t p-4'>
                {footer}
              </footer>
            )}
            <DialogClose
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  className='absolute top-2 right-2'
                />
              }
            >
              <XIcon />
              <span className='sr-only'>{t('actions.close')}</span>
            </DialogClose>
          </DialogPrimitive.Popup>
          {/* Keep nested roots in the primitive's context, outside the parent's popup. */}
          <ParentPopupContext.Provider value={popupRef}>
            <Outlet />
          </ParentPopupContext.Provider>
        </DialogPortal>
      </Dialog>
    </RouteOverlayContext.Provider>
  );
}
