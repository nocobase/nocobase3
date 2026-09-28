export function superviseDevelopment(options: {
  rootDir: string;
  entry: string;
  baseEnv?: NodeJS.ProcessEnv;
  execArgv?: readonly string[];
}): Promise<number>;
