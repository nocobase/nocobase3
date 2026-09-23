import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  flattenKeys,
  i18nCheck,
  parseLocaleObject,
  UNRESOLVED,
} from '../../scripts/i18n-check.mjs';

const keysOf = (contents) => flattenKeys(parseLocaleObject(contents)).sort();

test('reads quoted dotted keys alongside nested groups', () => {
  assert.deepEqual(
    keysOf(`import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'auth.signIn': 'Sign in',
  "auth.email": "Email",
  shell: { workspace: 'Workspace', 'nav.home': 'Home' },
};

export type AppResource = LocaleResource<typeof enUS>;
export default enUS;
`),
    ['auth.email', 'auth.signIn', 'shell.nav.home', 'shell.workspace'],
  );
});

test('reads a locale default-exported as an object literal', () => {
  assert.deepEqual(
    keysOf(`export default {
  uploadFailed: 'File upload failed.',
  'files.status.error': 'Failed',
  count: 3,
};
`),
    ['count', 'files.status.error', 'uploadFailed'],
  );
});

test('keeps string contents that look like comments', () => {
  assert.deepEqual(
    keysOf(`const enUS = {
  // A comment between keys.
  docs: 'See https://docs.example.com/guide', /* trailing */
  pattern: 'Use /* and */ literally',
  last: 'Last',
};
export default enUS;
`),
    ['docs', 'last', 'pattern'],
  );
});

test('marks a locale whose keys are not all written out', () => {
  for (const contents of [
    `const enUS = { ...messages, extra: 'Extra' };\nexport default enUS;`,
    `const zhCN = { options: optionMessages.options };\nexport default zhCN;`,
    `export { default } from '../../locales/en-US.js';`,
  ]) {
    assert.equal(parseLocaleObject(contents)[UNRESOLVED], true, contents);
  }
  assert.equal(
    parseLocaleObject(`export default { enabled: true, label: 'Label' };`)[
      UNRESOLVED
    ],
    undefined,
  );
});

test('compares each locale directory against its source locale', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'nocobase-i18n-check-'));
  try {
    const locales = path.join(
      repoRoot,
      'packages/plugins/example/client/locales',
    );
    const spread = path.join(repoRoot, 'packages/plugins/spread/locales');
    const item = path.join(
      repoRoot,
      'ui-library/registry/auth/auth-ui/locales',
    );
    await mkdir(locales, { recursive: true });
    await mkdir(spread, { recursive: true });
    await mkdir(item, { recursive: true });
    await writeFile(
      path.join(item, 'en-US.ts'),
      `const enUS = { 'auth.methods': 'Authentication methods' };\nexport default enUS;`,
    );
    await writeFile(path.join(item, 'zh-CN.ts'), `export default {};`);

    await writeFile(
      path.join(locales, 'en-US.ts'),
      `const enUS = {
  'auth.signIn': 'Sign in',
  'auth.email': 'Email',
  tools: { count_one: '{{count}} tool', count_other: '{{count}} tools' },
};
export default enUS;
`,
    );
    // Chinese has no singular form, and an application may reword another package's copy in any locale.
    await writeFile(
      path.join(locales, 'zh-CN.ts'),
      `const zhCN = {
  'auth.signIn': '登录',
  tools: { count_other: '{{count}} 个工具' },
  overrides: { '@nocobase/app-plugin-other': { title: '标题' } },
  'auth.stale': '过期',
};
export default zhCN;
`,
    );
    // Not locales, though they sit in the same directory.
    await writeFile(
      path.join(locales, 'index.ts'),
      `export default { 'en-US': () => import('./en-US.js') };`,
    );
    await writeFile(
      path.join(locales, 'use-translate.ts'),
      `export default { unrelated: 'value' };`,
    );
    await writeFile(
      path.join(spread, 'en-US.ts'),
      `const enUS = { ...shared };\nexport default enUS;`,
    );
    await writeFile(
      path.join(spread, 'zh-CN.ts'),
      `export default { only: '仅' };`,
    );

    const { reports, skipped } = await i18nCheck({ repoRoot });

    assert.deepEqual(reports, [
      {
        directory: 'packages/plugins/example/client/locales',
        locale: 'zh-CN',
        missing: ['auth.email'],
        extra: ['auth.stale'],
      },
      {
        directory: 'ui-library/registry/auth/auth-ui/locales',
        locale: 'zh-CN',
        missing: ['auth.methods'],
        extra: [],
      },
    ]);
    assert.deepEqual(skipped, ['packages/plugins/spread/locales/en-US.ts']);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
