// shadcn base-nova source adapted for declaration-emitting ESM builds.
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export function DropdownMenu(props: MenuPrimitive.Root.Props): ReactElement {
  return <MenuPrimitive.Root {...props} />;
}
export function DropdownMenuTrigger(
  props: MenuPrimitive.Trigger.Props,
): ReactElement {
  return <MenuPrimitive.Trigger {...props} />;
}
export function DropdownMenuContent({
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    'align' | 'side' | 'sideOffset'
  >): ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className='isolate z-50'
      >
        <MenuPrimitive.Popup
          className={cn(
            'min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({
  className,
  ...props
}: MenuPrimitive.Item.Props): ReactElement {
  return (
    <MenuPrimitive.Item
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: MenuPrimitive.CheckboxItem.Props): ReactElement {
  return (
    <MenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className='pointer-events-none absolute right-2 flex items-center justify-center'>
        <MenuPrimitive.CheckboxItemIndicator>
          <Check className='size-4' />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}
