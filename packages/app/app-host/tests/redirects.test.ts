import { expect, it } from 'vitest';

import { addBasePathToHtmlResponse } from '../dist/redirects.js';

it('rewrites root-relative asset attributes to the mounted app path', async () => {
  const html = `
    <script src="/main/assets/index.js"></script>
    <link href='/assets/index.css'>
    <meta property="og:image" content="/build/assets/preview.png">
    <script src="/customer/assets/already.js"></script>
    <script src="//cdn.example.com/assets/vendor.js"></script>
    <script src="https://cdn.example.com/assets/vendor.js"></script>
  `;
  const response = new Response(html, {
    headers: {
      'content-length': String(Buffer.byteLength(html)),
      'content-type': 'text/html; charset=utf-8',
      'x-app-header': 'preserved',
    },
    status: 201,
    statusText: 'Created',
  });

  const rewritten = await addBasePathToHtmlResponse(response, '/customer');

  expect(rewritten.status).toBe(201);
  expect(rewritten.statusText).toBe('Created');
  expect(rewritten.headers.get('x-app-header')).toBe('preserved');
  expect(rewritten.headers.get('content-length')).toBeNull();
  await expect(rewritten.text()).resolves.toBe(`
    <script src="/customer/assets/index.js"></script>
    <link href='/customer/assets/index.css'>
    <meta property="og:image" content="/customer/assets/preview.png">
    <script src="/customer/assets/already.js"></script>
    <script src="//cdn.example.com/assets/vendor.js"></script>
    <script src="https://cdn.example.com/assets/vendor.js"></script>
  `);
});

it('leaves non-HTML responses untouched', async () => {
  const response = Response.json({ asset: '/main/assets/index.js' });

  const result = await addBasePathToHtmlResponse(response, '/customer');

  expect(result).toBe(response);
});
