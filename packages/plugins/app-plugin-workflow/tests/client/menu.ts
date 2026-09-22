import { fireEvent, screen } from '@testing-library/react';

/**
 * Opens a Base UI menu by its trigger's accessible name and returns the trigger.
 *
 * Base UI connects a trigger to its menu from a layout effect that runs after the button has
 * already reached the DOM, and `aria-expanded` is the first attribute that proves the connection
 * landed. A click dispatched before it is routed to a store whose `setOpen` is still a no-op, so
 * the menu silently stays closed and every later query for its items fails. Waiting for the
 * button alone is not enough: `findByRole` resolves on the render that merely painted it, which
 * is why the trigger is matched by its collapsed state instead.
 */
export async function openMenu(name: string): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name, expanded: false });
  fireEvent.click(trigger);
  return trigger;
}
