import { allRecords, assertValidFilter, condition, filter } from './filter.js';
import type { PolicyDefinition } from './types.js';

const recordScopeUsages = ['recordScope', 'sharingRule', 'restrictionRule'] as const;

function requiredAttribute(resource: { attributes?: Readonly<Record<string, string>> }, key: string): string {
  const field = resource.attributes?.[key];
  if (!field) {
    throw new Error(`Resource does not declare the "${key}" attribute`);
  }
  return field;
}

export function standardPolicies(): PolicyDefinition[] {
  return [
    {
      key: 'allRecords',
      title: 'All Records',
      appliesTo: recordScopeUsages,
      compile: ({ resource }) => allRecords(resource.name),
    },
    {
      key: 'recordsIOwn',
      title: 'Records I Own',
      appliesTo: recordScopeUsages,
      compile: ({ principal, resource }) => filter(
        resource.name,
        condition(requiredAttribute(resource, 'owner'), '$eq', principal.id),
      ),
    },
    {
      key: 'recordsICreated',
      title: 'Records I Created',
      appliesTo: recordScopeUsages,
      compile: ({ principal, resource }) => filter(
        resource.name,
        condition(requiredAttribute(resource, 'creator'), '$eq', principal.id),
      ),
    },
    {
      key: 'customCriteria',
      title: 'Custom Criteria',
      appliesTo: recordScopeUsages,
      compile: ({ resource, params }) => {
        const ast = (params as { filter?: unknown } | undefined)?.filter;
        assertValidFilter(ast);
        if (ast.collection !== resource.name) {
          throw new Error(`customCriteria filter must target "${resource.name}"`);
        }
        return ast;
      },
    },
  ];
}
