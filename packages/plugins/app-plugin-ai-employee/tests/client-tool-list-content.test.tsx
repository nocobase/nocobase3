// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ToolListContent } from '../client/components/tool-list-content.js';

it('clamps long introductions and exposes the complete plain text on hover, updating when content changes', () => {
  const text = 'Long introduction. '.repeat(100).trim();
  const view = render(
    <ToolListContent
      name='query'
      title='Query records'
      about={`**${text}**`}
    />,
  );
  const summary = view.container.querySelector('.line-clamp-2')!;
  expect(summary).toHaveAttribute('title', text);
  expect(summary).toHaveTextContent(text);
  expect(summary.querySelector('strong')).toBeNull();
  expect(screen.getByText('Query records')).toHaveClass('truncate');
  expect(screen.getByText('query')).toHaveClass('truncate');
  view.rerender(
    <ToolListContent name='query' title='query' about='New *introduction*' />,
  );
  expect(screen.getAllByText('query')).toHaveLength(1);
  expect(view.container.querySelector('.line-clamp-2')).toHaveAttribute(
    'title',
    'New introduction',
  );
});

it('omits empty introductions while preserving the status', () => {
  const view = render(
    <ToolListContent name='missing' about='  ' status='Missing' />,
  );
  expect(view.container.querySelector('.line-clamp-2')).toBeNull();
  expect(screen.getByText('Missing')).toBeVisible();
});
