import type { LLMServiceEntity, LLMServiceRepository } from '../llm-service.js';
import { MemoryCollectionRepository } from './collection.js';

export class MemoryLLMServiceRepository
  extends MemoryCollectionRepository<LLMServiceEntity>
  implements LLMServiceRepository {}
