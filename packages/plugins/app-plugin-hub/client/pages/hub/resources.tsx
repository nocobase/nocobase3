import { Database, HardDrive, PackageOpen, Shapes, Zap } from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { useState, type ReactElement, type ReactNode } from 'react';
import { parse as parseYaml } from 'yaml';
import type { ConfigMode, ResourceKind, ResourceSummary } from './types.js';
import { Empty } from './shared.js';
import { isClientRecord } from './utils.js';

export function Resources({
  mode,
  content,
}: {
  readonly mode: ConfigMode;
  readonly content: string;
}): ReactElement {
  const [kind, setKind] = useState<ResourceKind>('databases');
  const groups = resourceGroups(content);
  const navigation: readonly {
    readonly value: ResourceKind;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [
    { value: 'databases', label: 'Databases', icon: <Database /> },
    { value: 'drives', label: 'Drives', icon: <HardDrive /> },
    { value: 'caching', label: 'Caching', icon: <Zap /> },
    { value: 'llm', label: 'LLM services', icon: <Shapes /> },
  ];
  return (
    <Tabs
      className='grid min-h-80 grid-cols-[11rem_minmax(0,1fr)] gap-6'
      onValueChange={(value) => setKind(value as ResourceKind)}
      orientation='vertical'
      value={kind}
    >
      <TabsList className='h-fit flex-col items-stretch gap-1 overflow-visible'>
        {navigation.map((item) => (
          <TabsTrigger
            className={(state) =>
              `flex w-full flex-row items-center justify-start gap-2 rounded-md border-0 px-3 py-2.5 text-left ${state.active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted/60'}`
            }
            key={item.value}
            value={item.value}
          >
            <span className='inline-flex shrink-0 items-center justify-center [&_svg]:size-4'>
              {item.icon}
            </span>
            <span className='min-w-0 truncate'>{item.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className='min-w-0'>
        {navigation.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <div className='mb-5'>
              <h2 className='font-semibold'>{item.label}</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                {resourceDescription(item.value)}
              </p>
            </div>
            <ResourceTable
              external={mode === 'external'}
              items={groups[item.value]}
              kind={item.value}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

export function ResourceTable({
  external,
  items,
  kind,
}: {
  readonly external: boolean;
  readonly items: readonly ResourceSummary[];
  readonly kind: ResourceKind;
}): ReactElement {
  if (items.length === 0) {
    return (
      <Empty
        icon={kind === 'llm' ? <Shapes /> : <PackageOpen />}
        title={`No ${resourceLabel(kind)} found`}
        description={
          external
            ? 'This application uses external configuration, so Hub cannot inspect its resource keys.'
            : kind === 'llm'
              ? 'LLM services are managed by the application and will appear here when the management API is connected.'
              : 'No matching keys were found in the current config.yml.'
        }
      />
    );
  }
  return (
    <div className='overflow-hidden rounded-xl border'>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <TableHead>Key</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className='w-28'>Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.key}>
              <TableCell className='font-mono text-xs'>{item.key}</TableCell>
              <TableCell>
                <Badge className='bg-sky-500/10 text-sky-700'>
                  {item.type}
                </Badge>
              </TableCell>
              <TableCell>
                {item.details.length ? (
                  <dl className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                    {item.details.map((detail) => (
                      <div
                        className='flex min-w-0 items-baseline gap-1.5'
                        key={detail.label}
                      >
                        <dt className='shrink-0 text-muted-foreground'>
                          {detail.label}
                        </dt>
                        <dd
                          className='max-w-56 truncate font-mono text-foreground'
                          title={detail.value}
                        >
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
              <TableCell>
                {item.isDefault ? (
                  <Badge className='bg-emerald-500/10 text-emerald-700'>
                    Default
                  </Badge>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function resourceGroups(
  content: string,
): Readonly<Record<ResourceKind, readonly ResourceSummary[]>> {
  let root: Record<string, unknown> = {};
  try {
    const parsed: unknown = content.trim() ? parseYaml(content) : {};
    if (isClientRecord(parsed)) root = parsed;
  } catch {
    return { databases: [], drives: [], caching: [], llm: [] };
  }
  const database = childRecord(root, 'database');
  const drive = childRecord(root, 'drive');
  const caching = childRecord(root, 'caching');
  const llm = childRecord(root, 'llm');
  return {
    databases: summarizeResources(
      childRecord(database, 'connections'),
      scalarString(database.default),
      'dialect',
      [
        'database',
        'filename',
        'host',
        'port',
        'schema',
        'charset',
        'timezone',
        'socketPath',
        'debug',
        'managed',
      ],
    ),
    drives: summarizeResources(
      childRecord(drive, 'disks'),
      scalarString(drive.default),
      'driver',
      [
        'location',
        'bucket',
        'region',
        'endpoint',
        'url',
        'cdnUrl',
        'visibility',
        'encryption',
        'forcePathStyle',
        'supportsACL',
      ],
    ),
    caching: summarizeResources(
      childRecord(caching, 'providers'),
      scalarString(caching.default),
      'driver',
      ['defaultTtl', 'maxTtl', 'maxSize', 'checkInterval', 'useClone'],
    ),
    llm: summarizeResources(
      childRecord(llm, 'services'),
      scalarString(llm.default),
      'provider',
      ['model', 'baseURL'],
    ),
  };
}

function summarizeResources(
  values: Record<string, unknown>,
  defaultKey: string | undefined,
  typeKey: 'dialect' | 'driver' | 'provider',
  detailKeys: readonly string[],
): readonly ResourceSummary[] {
  return Object.entries(values)
    .map(([key, value]) => {
      const settings = isClientRecord(value) ? value : {};
      return {
        key,
        type:
          scalarString(settings[typeKey]) ??
          scalarString(settings.driver) ??
          'Configured',
        isDefault: key === defaultKey,
        details: detailKeys.flatMap((detailKey) => {
          const detailValue = displayResourceValue(
            detailKey,
            settings[detailKey],
          );
          return detailValue === undefined
            ? []
            : [{ label: formatResourceField(detailKey), value: detailValue }];
        }),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function childRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const child = value[key];
  return isClientRecord(child) ? child : {};
}

function scalarString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function displayScalar(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === 'string' && Boolean(item),
    );
    return items.length ? items.join(', ') : undefined;
  }
  return undefined;
}

function displayResourceValue(key: string, value: unknown): string | undefined {
  const displayed = displayScalar(value);
  if (displayed === undefined) return undefined;
  if (!['baseURL', 'cdnUrl', 'endpoint', 'url'].includes(key)) return displayed;
  try {
    const parsed = new URL(displayed);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return displayed.includes('@') || displayed.includes('?')
      ? undefined
      : displayed;
  }
}

function formatResourceField(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    baseURL: 'Base URL',
    cdnUrl: 'CDN URL',
    checkInterval: 'Check interval',
    defaultTtl: 'Default TTL',
    forcePathStyle: 'Path style',
    maxSize: 'Max size',
    maxTtl: 'Max TTL',
    socketPath: 'Socket',
    supportsACL: 'ACL support',
    useClone: 'Clone values',
  };
  return labels[value] ?? `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function resourceLabel(kind: ResourceKind): string {
  if (kind === 'databases') return 'database connections';
  if (kind === 'drives') return 'drives';
  if (kind === 'caching') return 'cache providers';
  return 'LLM services';
}

function resourceDescription(kind: ResourceKind): string {
  if (kind === 'databases') {
    return 'Database connections discovered by key from database.connections.';
  }
  if (kind === 'drives') {
    return 'Storage disks discovered by key from drive.disks.';
  }
  if (kind === 'caching') {
    return 'Cache providers discovered by key from caching.providers.';
  }
  return 'Language model services available to this application.';
}
