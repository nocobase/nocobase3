// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SelectField } from '../client/components/select-field.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../client/components/ui/dialog.js';
import { selectOption } from './select-option.js';

function Editor() {
  const [value, setValue] = useState('');
  return (
    <SelectField
      aria-label='Group'
      value={value}
      onValueChange={setValue}
      options={[
        { value: '', label: 'All groups' },
        { value: 'sales', label: 'Sales' },
      ]}
    />
  );
}

it('shows labels, highlights the current selection, and allows returning to an empty-valued option inside a dialog', async () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Scope</DialogTitle>
        <Editor />
      </DialogContent>
    </Dialog>,
  );
  const trigger = screen.getByRole('combobox', { name: 'Group' });
  expect(trigger).toHaveTextContent('All groups');
  await selectOption(trigger, 'Sales');
  expect(trigger).toHaveTextContent('Sales');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(await screen.findByRole('option', { name: 'Sales' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const all = screen.getByRole('option', { name: 'All groups' });
  fireEvent.pointerDown(all);
  fireEvent.click(all);
  expect(trigger).toHaveTextContent('All groups');
});

it('opens with the keyboard and Escape returns focus to the trigger', async () => {
  render(<Editor />);
  const trigger = screen.getByRole('combobox', { name: 'Group' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: 'All groups' });
  fireEvent.keyDown(option, { key: 'Escape' });
  await waitFor(() =>
    expect(trigger).toHaveAttribute('aria-expanded', 'false'),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
});
