import { Device } from "@capacitor/device";

const STORAGE_KEY = "flowtv_device_uuid";
const TRIAL_KEY = "flowtv_device_trial_info";

export async function getDeviceIdentifier(): Promise<string> {
  let devId = "";
  try {
    const idInfo = await Device.getId();
    if (idInfo && idInfo.identifier) {
      devId = idInfo.identifier;
    }
  } catch (e) {
    // fallback
  }

  if (!devId && typeof window !== "undefined") {
    try {
      devId = localStorage.getItem(STORAGE_KEY) || "";
    } catch {}
  }

  if (!devId) {
    const randPart = Math.random().toString(36).substring(2, 12);
    const timePart = Date.now().toString(36);
    devId = `FLOW-${timePart}-${randPart}`;
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, devId);
    } catch {}
  }

  return devId;
}

export interface LocalDeviceTrial {
  phone?: string;
  username?: string;
  password?: string;
  expiresAt?: string;
  payUrl?: string;
  customerName?: string;
  createdAt?: number;
}

export function getLocalDeviceTrial(): LocalDeviceTrial | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(TRIAL_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveLocalDeviceTrial(trial: LocalDeviceTrial) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRIAL_KEY, JSON.stringify(trial));
  } catch {}
}
