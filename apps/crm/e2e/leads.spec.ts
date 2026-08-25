import { expect, test } from '@playwright/test';

import {
  installPortalSession,
  loadPortalE2EEnvironment,
  portalAction,
  requirePortalE2ECredentials,
  resolvePortalTestURL,
  signInPortal,
} from './support';

const environment = loadPortalE2EEnvironment();

test('creates, reviews, edits, and removes a sales lead', async ({
  page,
  request,
}, testInfo) => {
  const credentials = requirePortalE2ECredentials(environment);
  const session = await signInPortal(request, environment, credentials);
  const leadName = `E2E local lead ${testInfo.workerIndex}-${Date.now()}`;

  await installPortalSession(page, environment, session);

  try {
    await page.goto(resolvePortalTestURL(environment, '/dashboard'));
    await expect(
      page.getByRole('heading', { name: '销售作战台', exact: true }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: '新增销售线索', exact: true })
      .click();
    const createDialog = page.getByRole('dialog', { name: '新建线索' });
    await createDialog.getByLabel('联系人', { exact: true }).fill(leadName);
    await createDialog
      .getByLabel('公司', { exact: true })
      .fill('Codex local verification');
    await createDialog
      .getByRole('button', { name: '创建线索', exact: true })
      .click();

    const leadRow = page.getByRole('row').filter({ hasText: leadName });
    await expect(leadRow).toContainText('Codex local verification');
    await expect(leadRow).toContainText('50');

    await leadRow
      .getByRole('button', { name: '查看线索', exact: true })
      .click();
    await expect(page).toHaveURL(/\/leads\/show\/[^/]+$/);
    const detailDialog = page.getByRole('dialog', { name: leadName });
    await expect(detailDialog).toContainText('Codex local verification');

    await detailDialog
      .getByRole('button', { name: '编辑线索', exact: true })
      .click();
    const editDialog = page.getByRole('dialog', { name: '编辑线索' });
    await editDialog.getByLabel('线索评分', { exact: true }).fill('65');
    await editDialog
      .getByRole('button', { name: '保存修改', exact: true })
      .click();
    await expect(editDialog).toBeHidden();
    await expect(detailDialog.getByText('65', { exact: true })).toBeVisible();

    await detailDialog
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    await leadRow
      .getByRole('button', { name: '删除线索', exact: true })
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(leadRow).toHaveCount(0);
  } finally {
    const records = await portalAction<Array<{ id: string }>>(
      request,
      environment,
      'agent_crm_leads',
      'list',
      {
        query: { filter: JSON.stringify({ name: leadName }), pageSize: 10 },
        session,
      },
    );
    for (const record of records) {
      await portalAction(request, environment, 'agent_crm_leads', 'destroy', {
        query: { filterByTk: record.id },
        session,
      });
    }
  }
});
