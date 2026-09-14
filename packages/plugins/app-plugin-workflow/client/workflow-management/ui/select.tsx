import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type { ReactElement } from 'react';

function classes(...values: (string | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

function staticClassName(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function Select(
  props: SelectPrimitive.Root.Props<string>,
): ReactElement {
  return <SelectPrimitive.Root<string> {...props} />;
}

export function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props): ReactElement {
  return (
    <SelectPrimitive.Trigger
      className={classes(
        'flex h-9 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-3 text-sm whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        staticClassName(className),
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className='size-4 text-muted-foreground' />}
      />
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props): ReactElement {
  return (
    <SelectPrimitive.Value
      className={classes('flex flex-1 text-left', staticClassName(className))}
      {...props}
    />
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={4} className='z-50'>
        <SelectPrimitive.Popup
          className={classes(
            'max-h-(--available-height) min-w-36 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
            staticClassName(className),
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props): ReactElement {
  return (
    <SelectPrimitive.Item
      className={classes(
        'relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground',
        staticClassName(className),
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className='flex flex-1 whitespace-nowrap'>
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className='absolute right-2 flex size-4 items-center justify-center'>
        <CheckIcon className='size-4' />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
