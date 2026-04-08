import {
  clearDeviceAuthTokenFromStore,
  type DeviceAuthEntry,
  loadDeviceAuthTokenFromStore,
  storeDeviceAuthTokenInStore,
} from "../../../src/shared/device-auth-store.js";
import type { DeviceAuthStore } from "../../../src/shared/device-auth.js";
import { getSafeLocalStorage } from "../local-storage.ts";
import { normalizeGatewayStorageScope } from "./gateway-storage-scope.ts";

const LEGACY_STORAGE_KEY = "openclaw.device.auth.v1";
const STORAGE_KEY_PREFIX = "openclaw.device.auth.v1:";

function storageKeyForGateway(gatewayUrl: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeGatewayStorageScope(gatewayUrl)}`;
}

function parseStore(raw: string | null | undefined): DeviceAuthStore | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    if (!parsed.deviceId || typeof parsed.deviceId !== "string") {
      return null;
    }
    if (!parsed.tokens || typeof parsed.tokens !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readStore(gatewayUrl: string): DeviceAuthStore | null {
  try {
    const storage = getSafeLocalStorage();
    return (
      parseStore(storage?.getItem(storageKeyForGateway(gatewayUrl))) ??
      parseStore(storage?.getItem(LEGACY_STORAGE_KEY))
    );
  } catch {
    return null;
  }
}

export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl: string;
}): DeviceAuthEntry | null {
  return loadDeviceAuthTokenFromStore({
    adapter: {
      readStore: () => readStore(params.gatewayUrl),
      writeStore: () => {
        // no-op: read-only adapter
      },
    },
    deviceId: params.deviceId,
    role: params.role,
  });
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
  gatewayUrl: string;
}): DeviceAuthEntry {
  return storeDeviceAuthTokenInStore({
    adapter: {
      readStore: () => readStore(params.gatewayUrl),
      writeStore: (store) => {
        try {
          const storage = getSafeLocalStorage();
          storage?.setItem(storageKeyForGateway(params.gatewayUrl), JSON.stringify(store));
          storage?.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // best-effort
        }
      },
    },
    deviceId: params.deviceId,
    role: params.role,
    token: params.token,
    scopes: params.scopes,
  });
}

export function clearDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl: string;
}) {
  clearDeviceAuthTokenFromStore({
    adapter: {
      readStore: () => readStore(params.gatewayUrl),
      writeStore: (store) => {
        try {
          const storage = getSafeLocalStorage();
          const payload = JSON.stringify(store);
          storage?.setItem(storageKeyForGateway(params.gatewayUrl), payload);
          // Clear the legacy unscoped token too so stale cross-gateway auth does not stick around.
          storage?.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // best-effort
        }
      },
    },
    deviceId: params.deviceId,
    role: params.role,
  });
}
