export interface CredentialUserInput {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

export interface CreateCredentialUserOptions {
  readonly authBasePath: string;
  readonly baseURL?: string;
  handle(request: Request): Promise<Response>;
  verify(userId: string): Promise<boolean>;
}

export async function createCredentialUser(
  input: CredentialUserInput,
  options: CreateCredentialUserOptions,
): Promise<string> {
  const response = await options.handle(
    new Request(
      new URL(
        `${options.authBasePath.replace(/\/$/, '')}/sign-up/email`,
        options.baseURL ?? 'http://localhost',
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
  const payload = await readAuthPayload(response);
  if (!response.ok) throw new Error(readAuthError(payload));
  const userId = readCreatedUserId(payload);
  if (!userId) throw new Error('认证服务没有返回新用户 ID。');
  if (!(await options.verify(userId))) throw new Error('邮箱或用户名已存在。');
  return userId;
}

async function readAuthPayload(response: Response): Promise<unknown> {
  const value = await response.text();
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readCreatedUserId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const user = (payload as { readonly user?: unknown }).user;
  if (!user || typeof user !== 'object' || Array.isArray(user))
    return undefined;
  const id = (user as { readonly id?: unknown }).id;
  return typeof id === 'string' && id ? id : undefined;
}

function readAuthError(payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const message = (payload as { readonly message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return '无法创建登录账号。';
}
