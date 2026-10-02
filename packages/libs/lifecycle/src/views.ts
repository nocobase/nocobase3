import type { LifecycleDescription } from './definition.js';
import type { RecordView } from './runtime.js';

/** What `GET /:lifecycle` answers. */
export interface LifecycleDescriptionView {
  readonly description: LifecycleDescription;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Mermaid source of the state diagram. */
  readonly diagram: string;
}

/** What a fire answers: the record afterwards, and whether it was a replay. */
export interface FireView extends RecordView {
  readonly replayed: boolean;
}
