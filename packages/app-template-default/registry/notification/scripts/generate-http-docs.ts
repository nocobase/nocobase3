import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  notificationHttpRouteContracts,
  type NotificationHttpField,
  type NotificationHttpRouteContract,
} from '../server/http-contracts.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
interface JsonObject { [key: string]: JsonValue | undefined }

export function generateNotificationOpenApi(): JsonObject {
  const paths: JsonObject = {};
  for (const route of notificationHttpRouteContracts) {
    const pathItem = (paths[route.path] as JsonObject | undefined) ?? {};
    pathItem[route.method.toLowerCase()] = openApiOperation(route);
    paths[route.path] = pathItem;
  }
  return {
    openapi: '3.1.0',
    info: { title: 'NocoBase Notification HTTP API', version: '3.0-phase-1' },
    components: {
      securitySchemes: {
        cookieSession: { type: 'apiKey', in: 'cookie', name: 'nocobase_session' },
      },
    },
    paths,
  };
}

export function generateNotificationHttpMarkdown(): string {
  const lines = [
    '# Notification HTTP API',
    '',
    '> Generated from `server/http-contracts.ts`. Run the generator after changing a route contract.',
    '',
  ];
  for (const route of notificationHttpRouteContracts) {
    lines.push(`## ${route.method} ${route.path}`, '', route.summary, '', `Authentication: ${route.auth}. CSRF: ${route.csrf ? 'required' : 'not required'}.`, '');
    if (route.fields.length > 0) {
      lines.push('| Field | In | Type | Required | Description |', '| --- | --- | --- | --- | --- |');
      for (const field of route.fields) lines.push(`| ${field.name} | ${field.location} | ${field.type} | ${field.required ? 'yes' : 'no'} | ${field.description} |`);
      lines.push('');
    }
    if (route.requestExample) lines.push('Request example:', '', '```json', JSON.stringify(route.requestExample, null, 2), '```', '');
    lines.push('Response example:', '', '```json', JSON.stringify(route.responseExample, null, 2), '```', '', 'Errors:', '', '| Status | Code | Meaning |', '| --- | --- | --- |');
    for (const error of route.errors) lines.push(`| ${error.status} | ${error.code} | ${error.description} |`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function openApiOperation(route: NotificationHttpRouteContract): JsonObject {
  const parameters = route.fields.filter((field) => field.location !== 'body').map(openApiParameter);
  const bodyFields = route.fields.filter((field) => field.location === 'body');
  const responses: JsonObject = { '200': { description: 'Successful response', content: { 'application/json': { example: route.responseExample } } } };
  for (const error of route.errors) responses[String(error.status)] = { description: error.description, content: { 'application/json': { example: { error: { code: error.code } } } } };
  return {
    operationId: route.operationId,
    summary: route.summary,
    security: route.auth === 'session' ? [{ cookieSession: [] }] : [],
    parameters,
    requestBody: bodyFields.length > 0 ? { required: bodyFields.some((field) => field.required), content: { 'application/json': { schema: objectSchema(bodyFields), example: route.requestExample } } } : undefined,
    responses,
  };
}

function openApiParameter(field: NotificationHttpField): JsonObject {
  return { name: field.name, in: field.location, required: field.location === 'path' || field.required === true, description: field.description, schema: { type: field.type } };
}

function objectSchema(fields: readonly NotificationHttpField[]): JsonObject {
  const properties: JsonObject = {};
  for (const field of fields) properties[field.name] = { type: field.type, description: field.description };
  return { type: 'object', additionalProperties: false, properties, required: fields.filter((field) => field.required).map((field) => field.name) };
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsDirectory = path.resolve(currentDirectory, '../docs/generated');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(path.join(docsDirectory, 'openapi.json'), `${JSON.stringify(generateNotificationOpenApi(), null, 2)}\n`);
  await writeFile(path.join(docsDirectory, 'http-api.md'), generateNotificationHttpMarkdown());
}
