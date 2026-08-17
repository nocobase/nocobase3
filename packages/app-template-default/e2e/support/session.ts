import type { Page } from "@playwright/test";
import {
  resolveAuthSessionStorageKey,
  type AuthSessionField,
} from "@nocobase/portal-sdk/client";

import type { PortalE2ESession } from "./api";
import type { PortalE2EEnvironment } from "./environment";

export function getPortalStorageKey(
  environment: Pick<
    PortalE2EEnvironment,
    "appName" | "shareToken" | "storagePrefix"
  >,
  field: AuthSessionField
) {
  return resolveAuthSessionStorageKey(environment, field);
}

const getSessionValues = (
  environment: PortalE2EEnvironment,
  session: PortalE2ESession
) => ({
  [getPortalStorageKey(environment, "token")]: session.token,
  [getPortalStorageKey(environment, "auth")]: session.authenticator,
  [getPortalStorageKey(environment, "role")]: session.role,
  [getPortalStorageKey(environment, "locale")]: session.locale,
});

export async function installPortalSession(
  page: Page,
  environment: PortalE2EEnvironment,
  session: PortalE2ESession
) {
  const payload = {
    storageType: environment.storageType,
    values: getSessionValues(environment, session),
  };
  const applySession = ({
    storageType,
    values,
  }: {
    storageType: "localStorage" | "sessionStorage";
    values: Record<string, string | undefined>;
  }) => {
    const storage = window[storageType];
    Object.entries(values).forEach(([key, value]) => {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    });
  };

  await page.addInitScript(applySession, payload);
  const currentURL = page.url();
  if (
    /^https?:/i.test(currentURL) &&
    new URL(currentURL).origin === new URL(environment.baseURL).origin
  ) {
    await page.evaluate(applySession, payload);
  }
}

export async function readPortalSession(
  page: Page,
  environment: PortalE2EEnvironment
): Promise<PortalE2ESession | undefined> {
  const keys = {
    token: getPortalStorageKey(environment, "token"),
    authenticator: getPortalStorageKey(environment, "auth"),
    role: getPortalStorageKey(environment, "role"),
    locale: getPortalStorageKey(environment, "locale"),
  };
  const values = await page.evaluate(
    ({ storageType, sessionKeys }) => {
      const storage = window[storageType];
      return {
        token: storage.getItem(sessionKeys.token) ?? undefined,
        authenticator:
          storage.getItem(sessionKeys.authenticator) ?? undefined,
        role: storage.getItem(sessionKeys.role) ?? undefined,
        locale: storage.getItem(sessionKeys.locale) ?? undefined,
      };
    },
    { storageType: environment.storageType, sessionKeys: keys }
  );

  if (!values.token) return undefined;
  return {
    token: values.token,
    authenticator: values.authenticator ?? environment.authenticator,
    role: values.role,
    locale: values.locale,
  };
}

export async function savePortalStorageState(
  page: Page,
  environment: PortalE2EEnvironment,
  session: PortalE2ESession,
  path: string
) {
  if (environment.storageType === "sessionStorage") {
    throw new Error(
      "Playwright storageState cannot persist sessionStorage. Use installPortalSession for this Portal."
    );
  }
  await installPortalSession(page, environment, session);
  await page.goto(environment.baseURL);
  await page.context().storageState({ path });
}
