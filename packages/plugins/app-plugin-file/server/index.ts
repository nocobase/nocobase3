export { default } from './plugin.js';
export { serverFileRepositoryManagerToken } from './token.js';
export {
  ServerFileRepositoryManager,
  FileRepositoryError,
} from './repository.js';
export type {
  ServerFileRepository,
  FileRepositoryOptions,
  FileOperations,
} from './repository.js';
export { defineFileRepositoryApiRoutes } from './routes.js';
export type {
  DefineFileRepositoryApiRoutesOptions,
  FileRepositoryApiExposure,
  FileRepositoryApiActions,
} from './routes.js';
export type * from '../shared/types.js';
