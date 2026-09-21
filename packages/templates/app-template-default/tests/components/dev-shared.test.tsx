import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExamplePage, ExampleSection } from '../../client/pages/dev/shared';

describe('dev reference page frame', () => {
  it('renders the header, source path and docs link around its sections', () => {
    render(
      <ExamplePage
        title='Button'
        description='Triggers an action.'
        source='client/pages/dev/components/button.tsx'
        docs='https://ui.shadcn.com/docs/components/button'
      >
        <ExampleSection title='Variants' description='Six variants.'>
          <button type='button'>Save</button>
        </ExampleSection>
      </ExamplePage>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Button' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Triggers an action.')).toBeInTheDocument();
    expect(
      screen.getByText('client/pages/dev/components/button.tsx'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://ui.shadcn.com/docs/components/button',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Variants' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('omits the header actions and source line when nothing is given', () => {
    render(
      <ExamplePage title='Orders'>
        <ExampleSection title='Table'>rows</ExampleSection>
      </ExamplePage>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
  });
});
