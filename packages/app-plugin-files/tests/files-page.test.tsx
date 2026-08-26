import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FilesPage from '../client/default-pages/files-page.js';

describe('Files default page', () => {
  it('reports the independent runtime capability without manager actions', () => {
    const markup = renderToStaticMarkup(<FilesPage />);

    expect(markup).toContain('Files');
    expect(markup).toContain('Runtime enabled');
    expect(markup).toContain('Managed storage');
    expect(markup).toContain('Scoped access');
    expect(markup).toContain('Upload lifecycle');
    expect(markup).toContain('without installing a Registry item');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
  });
});
