import { Search, X } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';

/** A toolbar carrying filters: a sunk bar with its controls raised inside it. */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

const searchInputClassName =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-background pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

/** A search field that offers to clear itself while it holds text. */
export function SearchField({
  value,
  placeholder,
  label,
  className,
  disabled = false,
  onChange,
}: {
  value: string;
  placeholder: string;
  /** What the field searches, for anyone who cannot see the placeholder. */
  label: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative min-w-48 flex-1 sm:max-w-80', className)}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
      <input
        ref={inputRef}
        aria-label={label}
        className={searchInputClassName}
        disabled={disabled}
        placeholder={placeholder}
        type='text'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          aria-label={`Clear ${label.toLowerCase()}`}
          className='absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
          type='button'
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X className='size-3' />
        </button>
      ) : null}
    </div>
  );
}

/** A pressed-state chip that selects which rows a table shows. */
export function FilterChip({
  pressed,
  count,
  children,
  onClick,
}: {
  pressed: boolean;
  count?: number;
  children: ReactNode;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
      type='button'
      onClick={onClick}
    >
      {children}
      {count === undefined ? null : (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[0.625rem] tabular-nums',
            pressed ? 'bg-primary-foreground/20' : 'bg-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Returns every filter in its bar to the default. Shown only while one is away from it. */
export function ClearFilterButton({
  onClear,
}: {
  onClear: () => void;
}): ReactElement {
  return (
    <Button
      className='text-muted-foreground'
      size='sm'
      variant='ghost'
      onClick={onClear}
    >
      Clear filter
    </Button>
  );
}

/** Pushes what follows to the right of the bar. */
export function FilterBarSpacer(): ReactElement {
  return <span className='flex-1' />;
}

export interface SearchComboboxProps<T> {
  readonly value: string;
  readonly placeholder: string;
  /** What the field searches, for anyone who cannot see the placeholder. */
  readonly label: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** The matches for the current value; the caller decides how they are matched. */
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  readonly renderItem: (item: T) => ReactNode;
  readonly emptyMessage: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (item: T) => void;
}

/**
 * The same search field, with its matches beneath it: the arrow keys move
 * through them, Enter takes the one they are on, and Escape closes the list
 * without changing what is already chosen.
 */
export function SearchCombobox<T>({
  value,
  placeholder,
  label,
  disabled = false,
  className,
  items,
  itemKey,
  renderItem,
  emptyMessage,
  onChange,
  onSelect,
}: SearchComboboxProps<T>): ReactElement {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && value.trim() !== '';

  function choose(item: T): void {
    setOpen(false);
    setActive(-1);
    onSelect(item);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      setOpen(true);
      setActive((current) =>
        event.key === 'ArrowDown'
          ? (current + 1) % items.length
          : current <= 0
            ? items.length - 1
            : current - 1,
      );
      return;
    }
    if (event.key === 'Enter') {
      const item = items[active];
      if (expanded && item !== undefined) {
        event.preventDefault();
        choose(item);
      }
    }
  }

  return (
    <div className={cn('relative w-full max-w-md', className)}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
      <input
        aria-autocomplete='list'
        aria-controls={listId}
        aria-expanded={expanded}
        aria-label={label}
        autoComplete='off'
        className={searchInputClassName}
        disabled={disabled}
        placeholder={placeholder}
        role='combobox'
        type='text'
        value={value}
        onChange={(event) => {
          setOpen(true);
          setActive(-1);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        className={cn(
          'absolute top-[calc(100%+0.375rem)] right-0 left-0 z-20 max-h-72 overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-md',
          expanded ? '' : 'hidden',
        )}
        id={listId}
        role='listbox'
        // Taking the match must not close the list before the click lands.
        onMouseDown={(event) => event.preventDefault()}
      >
        {items.length === 0 ? (
          <p className='px-3 py-4 text-sm text-muted-foreground'>
            {emptyMessage}
          </p>
        ) : (
          items.map((item, index) => (
            <button
              key={itemKey(item)}
              aria-selected={index === active}
              className={cn(
                'flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted',
                index === active ? 'bg-muted' : '',
              )}
              role='option'
              type='button'
              onClick={() => choose(item)}
            >
              {renderItem(item)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
