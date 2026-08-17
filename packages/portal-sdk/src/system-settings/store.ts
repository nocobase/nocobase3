import { nocobaseClient } from "../client/index.ts";
import type { SystemSettings } from "./context.ts";

let cachedSettings: SystemSettings | undefined;
let settingsRequest: Promise<SystemSettings> | undefined;
let settingsGeneration = 0;

export function loadSystemSettings(force = false) {
  if (!force && cachedSettings) return Promise.resolve(cachedSettings);
  if (!force && settingsRequest) return settingsRequest;

  if (force) settingsGeneration += 1;
  const requestGeneration = settingsGeneration;

  const request = nocobaseClient
    .action<SystemSettings>("systemSettings", "get", {
      method: "GET",
      includeRole: false,
      withAclMeta: false,
    })
    .then((settings) => {
      if (requestGeneration === settingsGeneration) cachedSettings = settings;
      return settings;
    });

  settingsRequest = request;
  const clearRequest = () => {
    if (settingsRequest === request) settingsRequest = undefined;
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

export function clearSystemSettingsCache() {
  settingsGeneration += 1;
  cachedSettings = undefined;
  settingsRequest = undefined;
}
