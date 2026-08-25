import type {
  AppAccessMemberCreate,
  AppAccessMemberUpdate,
  AppAccessPermissionRow,
} from '../types.js';
import { AppAccessControlError } from './service.js';

export async function readAppAccessJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // The stable error below covers malformed and non-object JSON.
  }
  throw inputError('Request body must be a JSON object.', 400, 'BODY_INVALID');
}

export function parseAppAccessMemberCreate(
  body: Record<string, unknown>,
  roleKeys: readonly string[],
): AppAccessMemberCreate {
  const name = requireText(body.name, '姓名');
  const username = requireText(body.username, '用户名').toLowerCase();
  const email = requireText(body.email, '邮箱').toLowerCase();
  const password = requireText(body.password, '初始密码');
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    throw inputError(
      '用户名需为 3-30 位字母、数字、下划线或点。',
      422,
      'MEMBER_USERNAME_INVALID',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw inputError('请输入有效邮箱。', 422, 'MEMBER_EMAIL_INVALID');
  }
  if (password.length < 8) {
    throw inputError('初始密码至少 8 位。', 422, 'MEMBER_PASSWORD_INVALID');
  }
  const roleKey = parseRoleKey(body.roleKey, roleKeys);
  return { name, username, email, password, roleKey };
}

export function parseAppAccessMemberUpdate(
  body: Record<string, unknown>,
  roleKeys: readonly string[],
): AppAccessMemberUpdate {
  if (body.status !== 'active' && body.status !== 'disabled') {
    throw inputError('成员状态无效。', 400, 'MEMBER_STATUS_INVALID');
  }
  return {
    status: body.status,
    roleKey: parseRoleKey(body.roleKey, roleKeys),
  };
}

export function parseAppAccessPermissionRows(
  body: Record<string, unknown>,
): AppAccessPermissionRow[] {
  if (!Array.isArray(body.permissions)) {
    throw inputError(
      'permissions 必须为数组。',
      400,
      'PERMISSION_CONFIG_INVALID',
    );
  }
  return body.permissions.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw inputError('权限配置项无效。', 400, 'PERMISSION_CONFIG_INVALID');
    }
    return value as AppAccessPermissionRow;
  });
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw inputError(`${label}不能为空。`, 422, 'MEMBER_FIELD_REQUIRED');
  }
  return value.trim();
}

function parseRoleKey(value: unknown, roleKeys: readonly string[]): string {
  if (typeof value === 'string' && roleKeys.includes(value)) return value;
  throw inputError('无效的 App 角色。', 400, 'ROLE_INVALID');
}

function inputError(
  message: string,
  status: number,
  code: string,
): AppAccessControlError {
  return new AppAccessControlError(message, { status, code });
}
