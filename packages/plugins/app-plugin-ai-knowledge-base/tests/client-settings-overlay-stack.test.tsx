/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router';
import { expect, test } from 'vitest';

function Workspace(): ReactElement {
  const navigate = useNavigate();
  return (
    <>
      <p>Document list</p>
      <p>Segments drawer</p>
      <button
        type='button'
        onClick={() =>
          navigate('/settings/ai/knowledge-base/demo/documents/1/segments/a')
        }
      >
        Edit segment
      </button>
      <Outlet />
    </>
  );
}

function SegmentEditor(): ReactElement {
  const navigate = useNavigate();
  return (
    <section>
      <p>Segment editor</p>
      <button
        type='button'
        onClick={() => navigate('/settings/ai/knowledge-base/demo')}
      >
        Close editor
      </button>
    </section>
  );
}

test('keeps the document list and segments drawer mounted behind segment editing', () => {
  render(
    <MemoryRouter initialEntries={['/settings/ai/knowledge-base/demo']}>
      <Routes>
        <Route
          path='/settings/ai/knowledge-base/:knowledgeBaseKey'
          element={<Workspace />}
        >
          <Route
            path='documents/:documentId/segments/:segmentUid'
            element={<SegmentEditor />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit segment' }));
  expect(screen.getByText('Document list')).toBeDefined();
  expect(screen.getByText('Segments drawer')).toBeDefined();
  expect(screen.getByText('Segment editor')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  expect(screen.getByText('Document list')).toBeDefined();
  expect(screen.getByText('Segments drawer')).toBeDefined();
  expect(screen.queryByText('Segment editor')).toBeNull();
});
