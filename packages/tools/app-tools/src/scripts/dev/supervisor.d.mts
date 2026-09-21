export function superviseDevelopment(options: {
  rootDir: string;
  entry: string;
  baseEnv?: NodeJS.ProcessEnv;
}): Promise<number>;
