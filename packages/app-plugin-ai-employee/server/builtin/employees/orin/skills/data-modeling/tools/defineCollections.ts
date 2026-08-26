/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from '../../../../../../context.js';
import { defineTools } from '@nocobase/ai-employee';
import _ from 'lodash';
import { z } from 'zod';
// @ts-ignore
import pkg from '../../../../../package.json';

const idField = {
  name: 'id',
  type: 'snowflakeId',
  autoIncrement: false,
  primaryKey: true,
  allowNull: false,
  uiSchema: {
    type: 'number',
    title: `{{t("ai.tools.defineCollections.fields.id", { ns: "${pkg.name}" })}}`,
    'x-component': 'InputNumber',
    'x-component-props': {
      stringMode: true,
      separator: '0.00',
      step: '1',
    },
    'x-validator': 'integer',
  },
  interface: 'snowflakeId',
};
const createdAtField = {
  name: 'createdAt',
  interface: 'createdAt',
  type: 'date',
  field: 'createdAt',
  uiSchema: {
    type: 'datetime',
    title: `{{t("ai.tools.defineCollections.fields.createdAt", { ns: "${pkg.name}" })}}`,
    'x-component': 'DatePicker',
    'x-component-props': {},
    'x-read-pretty': true,
  },
};
const updatedAtField = {
  type: 'date',
  field: 'updatedAt',
  name: 'updatedAt',
  interface: 'updatedAt',
  uiSchema: {
    type: 'datetime',
    title: `{{t("ai.tools.defineCollections.fields.updatedAt", { ns: "${pkg.name}" })}}`,
    'x-component': 'DatePicker',
    'x-component-props': {},
    'x-read-pretty': true,
  },
};
const createdByField = {
  type: 'belongsTo',
  name: 'createdBy',
  interface: 'createdBy',
  target: 'users',
  foreignKey: 'createdById',
  uiSchema: {
    type: 'object',
    title: '{{t("Created by")}}',
    'x-component': 'AssociationField',
    'x-component-props': {
      fieldNames: {
        value: 'id',
        label: 'nickname',
      },
    },
    'x-read-pretty': true,
  },
};
const updatedByField = {
  type: 'belongsTo',
  name: 'updatedBy',
  interface: 'updatedBy',
  target: 'users',
  foreignKey: 'updatedById',
  uiSchema: {
    type: 'object',
    title: '{{t("Last updated by")}}',
    'x-component': 'AssociationField',
    'x-component-props': {
      fieldNames: {
        value: 'id',
        label: 'nickname',
      },
    },
    'x-read-pretty': true,
  },
};

class IntentError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export default defineTools<Context>({
  scope: 'SPECIFIED',
  introduction: {
    title: `{{t("ai.tools.defineCollections.title", { ns: "${pkg.name}" })}}`,
    about: `{{t("ai.tools.defineCollections.about", { ns: "${pkg.name}" })}}`,
  },
  definition: {
    name: 'defineCollections',
    description: 'Create or edit collections',
    schema: z.object({
      intent: z.enum(['create', 'edit']).describe(
        `Pass the intent of the current tool invocation as an enum value. The value must be either 'create' or 'edit':
- create: create a brand-new data table definition
- edit: modify an existing data table definition`,
      ),
      collections: z
        .array(
          z
            .object({})
            .catchall(z.any())
            .describe(
              'Valid collection object which defined in collection_type_definition',
            ),
        )
        .describe('An array of collections to be defined or edited.'),
    }),
  },
  invoke: async (ctx: Context, args: any) => {
    const toolCallArgs = ctx.action?.params?.values?.args?.intent
      ? ctx.action?.params?.values?.args
      : args;
    const { intent, collections: originalCollections } = toolCallArgs ?? {};
    if (!intent || !['create', 'edit'].includes(intent)) {
      return {
        status: 'error',
        content: `Please explicitly specify your intent. The value of the intent parameter must be either 'create' or 'edit'.`,
      };
    }
    const collectionsType = typeof originalCollections;
    const collections =
      collectionsType === 'string'
        ? JSON.parse(originalCollections)
        : originalCollections;
    if (!collections || !Array.isArray(collections)) {
      return {
        status: 'error',
        content: 'No collections provided or invalid format.',
      };
    }
    const sorted = collections.sort(
      (a, b) => (a.isThrough ? 1 : 0) - (b.isThrough ? 1 : 0),
    );
    try {
      const builder = ctx.database.builder;
      for (const rawOptions of sorted) {
        const options = { ...rawOptions, fields: rawOptions.fields ?? [] };
        if (intent === 'edit') {
          await builder.alterCollection(options.name, {
            addFields: options.fields.filter(
              (field: any) =>
                !['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'].includes(
                  field.type,
                ),
            ),
          });
        } else {
          await builder.createCollection(
            options.name,
            {
              fields: options.fields.filter(
                (field: any) =>
                  !['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'].includes(
                    field.type,
                  ),
              ),
            },
            { ifNotExists: true },
          );
        }
      }
    } catch (e) {
      ctx.logger.error(e, {
        module: 'ai',
        subModule: 'toolCalling',
        groupName: 'dataModeling',
        toolName: 'defineCollections',
        collections,
        stack: e.stack,
        cause: e.cause,
      });
      if (e instanceof IntentError) {
        return {
          status: 'error',
          content: e.message,
        };
      }
      if (intent === 'create') {
        for (const options of sorted) {
          // Schema changes are committed atomically by the database connection.
        }
      }
      return {
        status: 'error',
        content: `Failed to define collections: ${e.message}`,
      };
    }

    return {
      status: 'success',
      content: 'Defined collections successfully in one transaction.',
    };
  },
});
