import { Check } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

export interface ThemePreviewCardProps {
  /** The registry ID, which is both what the card previews and what a selection is stored as. */
  readonly id: string;
  readonly label: string;
  /** The radio group every card on the page shares, so the arrow keys move between them. */
  readonly name: string;
  readonly onSelect: () => void;
  readonly selected: boolean;
}

/**
 * One selectable theme.
 *
 * The thumbnail is drawn with the theme's own tokens: the "theme-preview" class plus "data-theme" is the contract the
 * preset stylesheets declare, so a card shows the preset instead of a second palette maintained in JavaScript. It
 * renders in the color mode in effect rather than in both at once, which is what keeps dozens of cards scannable.
 */
export function ThemePreviewCard({
  id,
  label,
  name,
  onSelect,
  selected,
}: ThemePreviewCardProps): ReactElement {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-xl border p-2 text-left transition-all select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
        selected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-xs'
          : 'border-border/70 hover:border-border hover:bg-muted/30',
      )}
    >
      <input
        type='radio'
        name={name}
        value={id}
        checked={selected}
        onChange={onSelect}
        className='sr-only'
      />
      <div
        aria-hidden='true'
        data-theme={id}
        className='theme-preview relative mb-2 flex aspect-[16/10] w-full overflow-hidden rounded-lg border border-border/80 bg-background shadow-2xs'
      >
        {/* Mini Sidebar */}
        <div className='flex w-6 flex-col gap-1 border-r border-sidebar-border/50 bg-sidebar p-1'>
          <div className='size-2 rounded-xs bg-sidebar-primary-foreground' />
          <div className='h-1 w-full rounded-xs bg-sidebar-foreground/30' />
          <div className='h-1 w-full rounded-xs bg-sidebar-foreground/20' />
        </div>
        {/* Mini Main Content Area */}
        <div className='flex flex-1 flex-col p-1.5'>
          <div className='mb-1 flex items-center justify-between border-b border-border/40 pb-1'>
            <div className='h-1 w-7 rounded-xs bg-foreground/70' />
            <div className='size-1.5 rounded-full bg-primary' />
          </div>
          <div className='flex flex-1 flex-col justify-between'>
            <div className='h-1 w-full rounded-xs bg-muted' />
            <div className='flex items-center justify-between pt-1'>
              <div className='h-1 w-6 rounded-xs bg-muted' />
              <div className='h-3 w-5 rounded-xs bg-primary shadow-xs' />
            </div>
          </div>
        </div>
      </div>
      <div className='mt-auto flex min-h-5 items-center justify-between gap-2 px-0.5'>
        <span
          className={cn(
            'text-xs transition-colors',
            selected
              ? 'font-medium text-foreground'
              : 'text-muted-foreground group-hover:text-foreground',
          )}
        >
          {label}
        </span>
        {selected ? (
          <span
            aria-hidden='true'
            data-testid='theme-selected-indicator'
            className='flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
          >
            <Check className='size-2 stroke-[3]' />
          </span>
        ) : null}
      </div>
    </label>
  );
}
