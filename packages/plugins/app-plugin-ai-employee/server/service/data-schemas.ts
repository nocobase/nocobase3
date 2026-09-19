import { z } from 'zod';
import type {
  DataAggregateInput,
  DataCondition,
  DataFilterInput,
  DataMetadataInput,
  DataPageInput,
  DataRowsInput,
  DataSearchInput,
  DataSourceInput,
} from './data-contracts.js';

const name = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine(
    (value) => !['__proto__', 'prototype', 'constructor'].includes(value),
    'Reserved name',
  );
const scalar = z.union([
  z.string().max(4096),
  z
    .number()
    .finite()
    .refine(
      (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
      'Use strings for large integers',
    ),
  z.boolean(),
  z.null(),
]);
const pagination = {
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10000).optional(),
};
const source = { dataSource: name.optional() };
const collection = { ...source, collection: name };
const condition: z.ZodType<DataCondition> = z
  .object({
    field: name,
    operator: z.enum([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'notIn',
      'includes',
      'startsWith',
      'endsWith',
      'empty',
      'notEmpty',
      'dateOn',
      'dateBefore',
      'dateAfter',
      'dateNotBefore',
      'dateNotAfter',
    ]),
    value: z.union([scalar, z.array(scalar).min(1).max(100)]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const noValue = value.operator === 'empty' || value.operator === 'notEmpty';
    const arrayValue = value.operator === 'in' || value.operator === 'notIn';
    if (
      noValue
        ? value.value !== undefined
        : value.value === undefined || arrayValue !== Array.isArray(value.value)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid operand for operator',
      });
  });
const filter = { ...collection, filter: z.array(condition).max(30).optional() };
const sort = z
  .array(z.object({ field: name, direction: z.enum(['asc', 'desc']) }).strict())
  .max(8);
export const getDataSourcesSchema: z.ZodType<DataPageInput> = z
  .object(pagination)
  .strict();
export const getCollectionNamesSchema: z.ZodType<DataSourceInput> = z
  .object({ ...source, ...pagination })
  .strict();
export const getCollectionMetadataSchema: z.ZodType<DataMetadataInput> = z
  .object({ ...collection, ...pagination })
  .strict();
export const searchFieldMetadataSchema: z.ZodType<DataSearchInput> = z
  .object({
    ...source,
    ...pagination,
    collection: name.optional(),
    query: z.string().trim().min(1).max(200),
  })
  .strict();
export const dataSourceCountingSchema: z.ZodType<DataFilterInput> = z
  .object(filter)
  .strict();
export const dataSourceQuerySchema: z.ZodType<DataRowsInput> = z
  .object({
    ...filter,
    ...pagination,
    fields: z.array(name).min(1).max(50),
    sort: sort.optional(),
    relations: z
      .array(
        z
          .object({
            relation: name,
            fields: z.array(name).min(1).max(20),
            limit: z.number().int().min(1).max(10).optional(),
          })
          .strict(),
      )
      .max(3)
      .optional(),
  })
  .strict();
export const dataQuerySchema: z.ZodType<DataAggregateInput> = z
  .object({
    ...filter,
    aggregates: z
      .array(
        z.union([
          z
            .object({
              function: z.literal('count'),
              alias: name,
              field: name.optional(),
            })
            .strict(),
          z
            .object({
              function: z.enum(['sum', 'avg', 'min', 'max']),
              alias: name,
              field: name,
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(20),
    groupBy: z
      .array(
        z
          .object({ field: name, values: z.array(scalar).min(1).max(100) })
          .strict(),
      )
      .min(1)
      .max(3)
      .optional(),
    sort: sort.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const aliases = value.aggregates.map((aggregate) => aggregate.alias);
    const groups = value.groupBy?.map((group) => group.field) ?? [];
    const keys = [...aliases, ...groups];
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Aggregate aliases and group fields must be unique',
      });
    if (
      (value.groupBy?.reduce((size, group) => size * group.values.length, 1) ??
        1) > 100
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most 100 possible groups are allowed',
      });
    if (
      value.sort?.some((item) => !keys.includes(item.field)) ||
      (!value.groupBy && value.sort?.length)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sort requires grouped fields or aggregate aliases',
      });
  });
