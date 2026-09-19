import { Job } from '../../src/index.js';

export default class DiscoveredJob extends Job<{ value: string }> {
  static options = { name: 'DiscoveredParameterPropertyJob' };

  constructor(private readonly record: (value: string) => void) {
    super();
  }

  async execute(): Promise<void> {
    this.record(this.payload.value);
  }
}
