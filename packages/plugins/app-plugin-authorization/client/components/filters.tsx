import { Search, X } from 'lucide-react';
import { useRef, type ReactElement, type ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { cn } from '../lib/utils.js';
import { Input } from './ui/input.js';
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
  const t = useAuthorizationTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative min-w-48 flex-1 sm:max-w-80', className)}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
      <Input
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
          aria-label={t('filters.clearSearch', {
            label: label.toLowerCase(),
          })}
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
  const t = useAuthorizationTranslation();
  return (
    <Button
      className='text-muted-foreground'
      size='sm'
      variant='ghost'
      onClick={onClear}
    >
      {t('filters.clear')}
    </Button>
  );
}

/** Pushes what follows to the right of the bar. */
export function FilterBarSpacer(): ReactElement {
  return <span className='flex-1' />;
}
