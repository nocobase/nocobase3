import { fireEvent, screen } from '@testing-library/react';

export async function selectOption(
  trigger: HTMLElement,
  label: string,
): Promise<void> {
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', {
    name: label,
    exact: true,
  });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}
