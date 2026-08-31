import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRoutesExample } from '../../client/contexts/routes-example-context.js';
import reactWrappers from '../../client/react-wrappers.js';

describe('client React wrappers', () => {
  it('defines a synchronous provider component', () => {
    const provider = reactWrappers[0];

    expect(provider).toMatchObject({
      name: 'routes-example',
      component: expect.any(Function),
    });
  });

  it('provides the routes example context', () => {
    const Provider = reactWrappers[0]?.component;
    if (!Provider) {
      throw new Error('Missing routes example provider.');
    }

    function Consumer() {
      const { description } = useRoutesExample();
      return <p>{description}</p>;
    }

    render(
      <Provider>
        <Consumer />
      </Provider>,
    );

    expect(
      screen.getByText(/provider contributed by the same client plugin/i),
    ).toBeInTheDocument();
  });
});
