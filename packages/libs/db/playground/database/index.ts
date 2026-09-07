import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  ModuleCollectionMetadataStore,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { bootstrapExternalCrm } from './external-crm/bootstrap.js';
import { externalCrmMetadata } from './external-crm/metadata.js';

export interface PlaygroundDatabasePaths {
  readonly root: string;
  readonly main: string;
  readonly crm: string;
}

export interface PlaygroundDatabase {
  readonly manager: DatabaseManager;
  readonly main: DatabaseConnection;
  readonly crm: DatabaseConnection;
  readonly paths: PlaygroundDatabasePaths;
  close(): Promise<void>;
}

export interface CreatePlaygroundDatabaseOptions {
  readonly reset?: boolean;
  readonly root?: string;
}

export async function createPlaygroundDatabase(
  options: CreatePlaygroundDatabaseOptions = {},
): Promise<PlaygroundDatabase> {
  const paths = playgroundDatabasePaths(options.root);
  if (options.reset) {
    await rm(paths.root, { recursive: true, force: true });
  }
  await mkdir(paths.root, { recursive: true });
  await bootstrapExternalCrm(paths.crm);

  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: paths.main,
        schemaManagement: 'managed',
        naming: { underscored: true, tablePrefix: 'shop_' },
      },
      crm: {
        dialect: 'sqlite',
        filename: paths.crm,
        schemaManagement: 'external',
        naming: { underscored: true, tablePrefix: 'crm_' },
        metadataStore: new ModuleCollectionMetadataStore({
          documents: externalCrmMetadata,
          source: '@nocobase/db playground external CRM',
        }),
      },
    },
  });

  try {
    const migrator = createMigrator({
      database: manager,
      connection: 'main',
      packageName: '@nocobase/db-playground',
      directory: fileURLToPath(new URL('./main/migrations/', import.meta.url)),
    });
    await migrator.latest();
    const seeder = createSeeder({
      database: manager,
      connection: 'main',
      packageName: '@nocobase/db-playground',
      directory: fileURLToPath(new URL('./main/seeds/', import.meta.url)),
    });
    await seeder.run();
    const [main, crm] = await Promise.all([
      manager.connect('main'),
      manager.connect('crm'),
    ]);
    await Promise.all([
      main.collections.validateRelations('products'),
      main.collections.validateRelations('orders'),
      main.collections.validateRelations('orderItems'),
      crm.collections.validateRelations('customers'),
      crm.collections.validateRelations('contacts'),
    ]);
    return {
      manager,
      main,
      crm,
      paths,
      close: () => manager.destroy(),
    };
  } catch (error) {
    await manager.destroy();
    throw error;
  }
}

export async function cleanPlaygroundDatabase(root?: string): Promise<void> {
  await rm(playgroundDatabasePaths(root).root, {
    recursive: true,
    force: true,
  });
}

function playgroundDatabasePaths(root?: string): PlaygroundDatabasePaths {
  const resolvedRoot =
    root ?? fileURLToPath(new URL('../tmp/', import.meta.url));
  return {
    root: resolvedRoot,
    main: path.join(resolvedRoot, 'main.sqlite'),
    crm: path.join(resolvedRoot, 'external-crm.sqlite'),
  };
}
