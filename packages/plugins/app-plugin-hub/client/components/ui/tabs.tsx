import { cva } from 'class-variance-authority';
import {
  createContext,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/utils.js';

type TabsOrientation = 'horizontal' | 'vertical';

interface TabsContextValue {
  readonly activeValue: string;
  readonly baseId: string;
  readonly orientation: TabsOrientation;
  readonly select: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: TabsOrientation;
  readonly children?: ReactNode;
}

function Tabs({
  className,
  orientation = 'horizontal',
  value,
  defaultValue = '',
  onValueChange,
  children,
  ...props
}: TabsProps): ReactElement {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const baseId = useId();
  const activeValue = value ?? uncontrolledValue;
  const select = (nextValue: string): void => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ activeValue, baseId, orientation, select }}>
      <div
        data-slot='tabs'
        data-orientation={orientation}
        data-horizontal={orientation === 'horizontal' ? '' : undefined}
        data-vertical={orientation === 'vertical' ? '' : undefined}
        className={cn(
          'group/tabs min-w-0 flex gap-2 data-horizontal:flex-col',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit max-w-full items-center justify-center overflow-x-auto rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        line: 'gap-1 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: 'default' | 'line';
}

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsListProps): ReactElement {
  const { orientation } = useTabsContext();
  return (
    <div
      role='tablist'
      aria-orientation={orientation}
      data-slot='tabs-list'
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly value: string;
}

function TabsTrigger({
  className,
  value,
  onClick,
  onKeyDown,
  ...props
}: TabsTriggerProps): ReactElement {
  const context = useTabsContext();
  const active = context.activeValue === value;
  const ids = tabIds(context.baseId, value);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const previousKey =
      context.orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const nextKey =
      context.orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    if (![previousKey, nextKey, 'Home', 'End'].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ) ?? [],
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === previousKey
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <button
      type='button'
      role='tab'
      id={ids.tab}
      aria-controls={ids.panel}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-slot='tabs-trigger'
      data-active={active ? '' : undefined}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.select(value);
      }}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: string;
}

function TabsContent({
  className,
  value,
  ...props
}: TabsContentProps): ReactElement | null {
  const context = useTabsContext();
  if (context.activeValue !== value) return null;
  const ids = tabIds(context.baseId, value);

  return (
    <div
      role='tabpanel'
      id={ids.panel}
      aria-labelledby={ids.tab}
      data-slot='tabs-content'
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  );
}

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context)
    throw new Error('Tabs components must be rendered inside Tabs.');
  return context;
}

function tabIds(baseId: string, value: string): { tab: string; panel: string } {
  const suffix = value.replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    tab: `${baseId}-tab-${suffix}`,
    panel: `${baseId}-panel-${suffix}`,
  };
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
