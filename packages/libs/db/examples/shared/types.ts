export type ExampleWriter = (message: string) => void;

export interface RunExampleOptions {
  readonly write?: ExampleWriter;
}

export interface ExampleCommandIO {
  readonly write: ExampleWriter;
}
