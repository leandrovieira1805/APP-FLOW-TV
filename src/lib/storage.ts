// FLOW TV — local persistence: account, cache, continue-watching, favorites.

import type { Account, UserInfo } from "./xtream";
import type { PaymentInfo } from "@/types/payment";

const ACCOUNT_KEY = "flowtv.account";
const DNS_KEY = "flowtv.dns";
const USERINFO_KEY = "flowtv.userinfo";
const PROGRESS_KEY = "flowtv.progress";
const FAV_KEY = "flowtv.favorites";
const CACHE_PREFIX = "flowtv.cache.";
const CLEANUP_DONE_KEY = "flowtv.cleanup.v1";

const isBrowser = typeof window !== "undefined";

// Clean up old cache on EVERY load to prevent quota errors
if (isBrowser) {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ---------- Account ----------
export function loadAccount(): Account | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const acc = JSON.parse(raw) as Account;
    if (acc && acc.base && typeof window !== "undefined" && window.location.protocol === "https:") {
      if (acc.base.startsWith("http://")) {
        acc.base = acc.base.replace("http://", "https://");
      }
      if (acc.base.startsWith("https://")) {
        acc.base = acc.base.replace(/:80(?=\/|$)/, "");
      }
      try {
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
      } catch {}
    }
    return acc;
  } catch {
    return null;
  }
}
export function saveAccount(account: Account, info?: UserInfo) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    if (info) localStorage.setItem(USERINFO_KEY, JSON.stringify(info));
  } catch (e) {
    console.warn("Failed to save account to localStorage", e);
  }
}
export function loadUserInfo(): UserInfo | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(USERINFO_KEY);
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  } catch {
    return null;
  }
}
export function clearAccount() {
  if (!isBrowser) return;
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(USERINFO_KEY);
  // clear caches too
  Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

// ---------- Admin DNS ----------
export function loadDns(): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(DNS_KEY);
  } catch {
    return null;
  }
}
export function saveDns(dns: string) {
  if (!isBrowser) return;
  localStorage.setItem(DNS_KEY, dns);
}
export function clearDns() {
  if (!isBrowser) return;
  localStorage.removeItem(DNS_KEY);
}

// ---------- App appearance settings (admin) ----------
const SETTINGS_KEY = "flowtv.settings";

export interface AppSettings {
  logo?: string; // data URL or remote URL
  background?: string; // data URL or remote URL
  banner?: string; // ad banner image (compatibilidade retroativa)
  bannerLink?: string; // optional click-through URL (compatibilidade retroativa)
  banners?: Array<{ image: string; link?: string }>; // multiple banners
  dnsList?: string[]; // up to 5 server DNS endpoints
  paymentInfo?: PaymentInfo | null;
  paymentStatus?: string | null;
}

export const SETTINGS_EVENT = "flowtv:settings";

export function loadSettings(): AppSettings {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as AppSettings) : {};
  } catch {
    return {};
  }
}
export function saveSettings(settings: AppSettings) {
  if (!isBrowser) return;
  
  // Clear old cache to free up space
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('flowtv.cache.'))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
  
  try {
    // Try to save normally
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Storage quota exceeded - trying safe save");
    
    // Try to save without large data URLs
    try {
      const safeSettings = { ...settings };
      // Remove large data URLs to save space
      if (safeSettings.logo?.startsWith('data:')) delete safeSettings.logo;
      if (safeSettings.background?.startsWith('data:')) delete safeSettings.background;
      if (safeSettings.banner?.startsWith('data:')) delete safeSettings.banner;
      if (safeSettings.banners) {
        safeSettings.banners = safeSettings.banners.map(b => ({
          ...b,
          image: b.image?.startsWith('data:') ? undefined : b.image
        })).filter(b => b.image !== undefined) as Array<{ image: string; link?: string }>;
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
    } catch (e2) {
      console.error("Storage still full - settings kept only in memory");
    }
  }
  
  // Dispatch event regardless of save success
  try {
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  } catch {}
}

// ---------- Cache (TTL) ----------
export function getCache<T>(key: string, maxAgeMs: number): T | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - parsed.t > maxAgeMs) return null;
    return parsed.v;
  } catch {
    return null;
  }
}
export function setCache<T>(key: string, value: T) {
  // Completely disabled - no persistent localStorage caching for large content
  return;
}

// ---------- Continue watching ----------
export interface ProgressEntry {
  key: string; // unique id e.g. "movie:123" or "ep:456"
  type: "movie" | "series";
  refId: number; // movie stream_id OR series_id
  episodeId?: string;
  title: string;
  poster: string;
  position: number; // seconds
  duration: number; // seconds
  updatedAt: number;
  // playback hint for resume
  ext?: string;
  seriesId?: number;
}

export function loadProgress(): ProgressEntry[] {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const list = raw ? (JSON.parse(raw) as ProgressEntry[]) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
export function getProgress(key: string): ProgressEntry | undefined {
  return loadProgress().find((p) => p.key === key);
}
export function saveProgress(entry: ProgressEntry) {
  if (!isBrowser) return;
  try {
    const list = loadProgress().filter((p) => p.key !== entry.key);
    // Drop entries that are essentially finished (>95%)
    if (entry.duration > 0 && entry.position / entry.duration < 0.95) {
      list.unshift(entry);
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(list.slice(0, 40)));
  } catch (e) {
    console.warn("Failed to save progress to localStorage", e);
  }
}
export function removeProgress(key: string) {
  if (!isBrowser) return;
  try {
    const list = loadProgress().filter((p) => p.key !== key);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to remove progress from localStorage", e);
  }
}

// ---------- Favorites ----------
export type FavType = "live" | "movie" | "series";
export interface Favorite {
  id: string; // `${type}:${refId}`
  type: FavType;
  refId: number;
  title: string;
  poster: string;
}
export function loadFavorites(): Favorite[] {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as Favorite[]) : [];
  } catch {
    return [];
  }
}
export function isFavorite(id: string): boolean {
  return loadFavorites().some((f) => f.id === id);
}
export function toggleFavorite(fav: Favorite): boolean {
  if (!isBrowser) return false;
  try {
    const list = loadFavorites();
    const exists = list.some((f) => f.id === fav.id);
    const next = exists ? list.filter((f) => f.id !== fav.id) : [fav, ...list];
    localStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 200)));
    return !exists;
  } catch (e) {
    console.warn("Failed to save favorite to localStorage", e);
    return false;
  }
}
