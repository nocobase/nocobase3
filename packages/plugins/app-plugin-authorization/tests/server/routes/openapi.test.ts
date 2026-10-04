import type { DatabaseConnection } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  ApiDocsService,
  apiDocsToken,
  findUndeclaredApiRoutes,
  type ApiDocument,
} from '@nocobase/app-server/router';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { documentedSettingsRouters } from '../../../server/extension/http.js';
import {
  AuthorizationProvider,
  createAppAuthorization,
  type AppAuthorization,
} from '../../../server/index.js';
import { mountedRouter } from '../../helpers/mounted-router.js';
import { testRulePlugin } from '../../helpers/rule-plugin.js';

/** Permission Sets need a connection to build their store; nothing here queries. */
const connection = { query: {} } as unknown as DatabaseConnection;

function operationIds(document: ApiDocument): string[] {
  return Object.values(document.paths ?? {})
    .flatMap((item) =>
      Object.values(item ?? {}).map(
        (operation) => (operation as { operationId?: string }).operationId,
      ),
    )
    .filter((id): id is string => id !== undefined)
    .sort();
}

const settingsOperationIds = [
  'authorizationAssignPermissionSet',
  'authorizationBatchDecideAccess',
  'authorizationCreatePermissionSet',
  'authorizationDecideAccess',
  'authorizationDeletePermissionSet',
  'authorizationGetConfiguredAccess',
  'authorizationGetPermissionSet',
  'authorizationListInspectorOptions',
  'authorizationListInspectorSubjects',
  'authorizationListPermissionSetAssignments',
  'authorizationListPermissionSetOptions',
  'authorizationListPermissionSetSubjects',
  'authorizationListPermissionSets',
  'authorizationResolveInspectorSubjects',
  'authorizationResolvePermissionSetSubjects',
  'authorizationRevokePermissionSetAssignment',
  'authorizationUpdatePermissionSet',
];

const ruleOperationIds = [
  'authorizationListSharingRulesOptions',
  'authorizationListSharingRulesRecords',
  'authorizationListSharingRulesSubjects',
  'authorizationResolveSharingRulesSubjects',
];

async function documentOf(
  authorization: AppAuthorization,
  warnings: string[] = [],
): Promise<ApiDocument> {
  const container = new ServiceContainer();
  const docs = new ApiDocsService();
  container.instance(apiDocsToken, docs);
  // Registers the authorization and authentication services, which the provider then reads.
  const mounted = await mountedRouter(authorization, { container });
  const provider = new AuthorizationProvider({
    container,
    config: { get: () => undefined },
  } as unknown as AppPluginApplication);
  await provider.boot();
  docs.attach({
    api: mounted,
    describe: () => ({ info: { title: 'Test', version: '1.0.0' } }),
    onWarning: (message) => warnings.push(message),
  });
  try {
    // `mountedRouter` mounts the routes under `/api` already, so the document is generated without a prefix of its own.
    return await generateApiDocumentFrom(docs);
  } finally {
    await provider.shutdown();
  }
}

/** The document as the service generates it, with the `/api` prefix the mounted router already carries removed. */
async function generateApiDocumentFrom(
  docs: ApiDocsService,
): Promise<ApiDocument> {
  const document = await docs.getDocument();
  const paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).map(([path, item]) => [
      path.replace(/^\/api\/api\//, '/api/'),
      item,
    ]),
  );
  return { ...document, paths };
}

describe('the API document', () => {
  it('declares the routes the application mounts and the settings routes behind the dispatcher', async () => {
    const authorization = createAppAuthorization({
      connection,
      config: { plugins: [testRulePlugin('sharing-rules')] },
    });
    const routers = documentedSettingsRouters(authorization.routes);

    expect(routers).toHaveLength(3);
    for (const routes of routers)
      expect(findUndeclaredApiRoutes(routes, '/api/authorization')).toEqual([]);
    expect(
      findUndeclaredApiRoutes(await mountedRouter(authorization), ''),
    ).toEqual([]);
  });

  it('lists every operation once the provider contributes the settings routes', async () => {
    const warnings: string[] = [];
    const document = await documentOf(
      createAppAuthorization({
        connection,
        config: { plugins: [testRulePlugin('sharing-rules')] },
      }),
      warnings,
    );

    // The fragment's components match the declared routes' own, so nothing is renamed or dropped.
    expect(warnings).toEqual([]);

    expect(operationIds(document)).toEqual(
      [
        'authorizationGetPermissions',
        ...settingsOperationIds,
        ...ruleOperationIds,
      ].sort(),
    );
    const create = document.paths?.['/api/authorization/permissionSets']?.post;
    expect(create?.tags).toEqual(['Authorization']);
    expect(Object.keys(create?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '409']),
    );
    expect(create?.requestBody).toBeDefined();
    expect(
      document.paths?.['/api/authorization/permissionSets/{key}']?.get
        ?.parameters,
    ).toEqual([
      expect.objectContaining({ in: 'path', name: 'key', required: true }),
    ]);
    expect(document.components?.schemas).toHaveProperty(
      'AuthorizationPermissionSet',
    );
  });
});
