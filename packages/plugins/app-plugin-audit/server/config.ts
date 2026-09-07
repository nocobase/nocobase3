import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';
import type {
  AuditDeploymentRequirements,
  AuditSettings,
} from './contracts.js';

export interface AuditConfig extends AuditDeploymentRequirements {
  readonly configurationStore: string;
  readonly stores: readonly string[];
  readonly defaults: Partial<Omit<AuditSettings, 'revision'>>;
}

const table = Type.Object(
  {
    dataSource: Type.String(),
    table: Type.String(),
    schema: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const auditConfig: AppConfigDefinition<AuditConfig> = defineAppConfig({
  namespace: 'audit',
  schema: Type.Object(
    {
      auditRequired: Type.Boolean(),
      requiredDataSources: Type.Array(Type.String(), { uniqueItems: true }),
      mandatorySources: Type.Array(
        Type.Union([
          Type.Literal('request'),
          Type.Literal('business'),
          Type.Literal('database'),
        ]),
        { uniqueItems: true },
      ),
      configurationStore: Type.String({ minLength: 1 }),
      stores: Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
        uniqueItems: true,
      }),
      defaults: Type.Object(
        {
          enabled: Type.Optional(Type.Boolean()),
          observationStore: Type.Optional(Type.String()),
          sources: Type.Optional(
            Type.Object(
              {
                http: Type.Union([
                  Type.Literal('disabled'),
                  Type.Literal('declared-routes'),
                ]),
                runtime: Type.Union([
                  Type.Literal('disabled'),
                  Type.Literal('integrated-producers'),
                ]),
                database: Type.Array(table),
              },
              { additionalProperties: false },
            ),
          ),
          retentionDays: Type.Optional(
            Type.Union([Type.Null(), Type.Integer({ minimum: 1 })]),
          ),
          maxDetailsBytes: Type.Optional(Type.Integer({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
  defaults: {
    auditRequired: false,
    requiredDataSources: [],
    mandatorySources: [],
    configurationStore: 'main',
    stores: ['main'],
    defaults: {
      enabled: true,
      sources: {
        http: 'declared-routes',
        runtime: 'integrated-producers',
        database: [],
      },
    },
  },
});
