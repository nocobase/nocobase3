import type { AIEmployeeEntity, AIEmployeeRepository } from '../ai-employee.js';
import { MemoryCollectionRepository } from './collection.js';

export class MemoryAIEmployeeRepository
  extends MemoryCollectionRepository<AIEmployeeEntity>
  implements AIEmployeeRepository {}
