export const NAME_KEY = "ordering.displayName";
export const DEVICE_KEY = "ordering.deviceId";

export type BrowserIdentity = { deviceId: string; displayName: string | null };
export type ActiveIdentity = { deviceId: string; displayName: string };

export function validateDisplayName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 30) throw new Error("姓名长度必须为 1 到 30 个字符");
  return trimmed;
}

export function loadIdentity(storage: Storage = localStorage): BrowserIdentity {
  let deviceId = storage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    storage.setItem(DEVICE_KEY, deviceId);
  }
  return { deviceId, displayName: storage.getItem(NAME_KEY) };
}

export function saveDisplayName(value: string, storage: Storage = localStorage): ActiveIdentity {
  const displayName = validateDisplayName(value);
  const { deviceId } = loadIdentity(storage);
  storage.setItem(NAME_KEY, displayName);
  return { deviceId, displayName };
}
