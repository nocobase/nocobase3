export type ExampleWriter = (message: string) => void;

export interface RunExampleOptions {
  readonly write?: ExampleWriter;
  readonly cleanup?: boolean;
  readonly tempDirectoryRoot?: string;
}

export interface ExampleCommandIO {
  readonly write: ExampleWriter;
  readonly tempDirectoryRoot?: string;
}
