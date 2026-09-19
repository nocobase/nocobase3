export interface ProtectedPermissionSetRegistry {
  register(owner: string, keys: readonly string[]): () => void;
  owner(key: string): string | undefined;
  isProtected(key: string): boolean;
}

export function createProtectedPermissionSetRegistry(): ProtectedPermissionSetRegistry {
  const owners = new Map<string, string>();
  return {
    register(owner, keys) {
      const registered: string[] = [];
      for (const key of keys) {
        const existing = owners.get(key);
        if (existing && existing !== owner) {
          throw new Error(
            `Permission Set "${key}" is already protected by ${existing}`,
          );
        }
        owners.set(key, owner);
        registered.push(key);
      }
      return () => {
        for (const key of registered) {
          if (owners.get(key) === owner) owners.delete(key);
        }
      };
    },
    owner: (key) => owners.get(key),
    isProtected: (key) => owners.has(key),
  };
}
