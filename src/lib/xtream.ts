
// ---------- Google Play Reviewer / Demo Mock Account ----------
const IS_DEMO_USER = (username?: string) => {
  const u = (username || "").trim().toLowerCase();
  return u === "google_tester" || u === "reviewer" || u === "demo_user" || u === "test_user";
};

const DEMO_LIVE_CATS: Category[] = [
  { category_id: "1", category_name: "Canais Ao Vivo (HD)" },
  { category_id: "2", category_name: "Notícias & Variedades" },
];

const DEMO_LIVE_STREAMS: LiveStream[] = [
  { stream_id: 101, name: "Big Buck Bunny HD Live", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg", category_id: "1" },
  { stream_id: 102, name: "Tears of Steel 4K Live", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/e/e0/Tears_of_Steel_poster.jpg", category_id: "1" },
  { stream_id: 103, name: "Sintel HD Live", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg", category_id: "2" },
];

const DEMO_VOD_CATS: Category[] = [
  { category_id: "10", category_name: "Filmes em Destaque" },
  { category_id: "11", category_name: "Animação & Ficção" },
];

const DEMO_VOD_STREAMS: VodStream[] = [
  { stream_id: 201, name: "Big Buck Bunny", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg", category_id: "10", rating: "8.5" },
  { stream_id: 202, name: "Tears of Steel", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/e/e0/Tears_of_Steel_poster.jpg", category_id: "10", rating: "8.2" },
  { stream_id: 203, name: "Sintel", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg", category_id: "11", rating: "8.9" },
  { stream_id: 204, name: "Elephant's Dream", stream_icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Elephants_Dream_poster.jpg/800px-Elephants_Dream_poster.jpg", category_id: "11", rating: "7.9" },
];

const DEMO_SERIES_CATS: Category[] = [
  { category_id: "20", category_name: "Séries Populares" },
];

const DEMO_SERIES: SeriesItem[] = [
  { series_id: 301, name: "Blender Open Creations", cover: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg", category_id: "20", rating: "9.0", plot: "A collection of open source animated short series produced by the Blender Foundation." },
];

import { Capacitor } from "@capacitor/core";
// FLOW TV — Xtream Codes API client (browser side).
// All JSON calls go through the server proxy at /api/public/xtream to avoid CORS.
// Stream URLs are built locally and played directly by the video player.

export interface Account {
  base: string; // normalized http(s)://host:port
  username: string;
  password: string;
}

export interface UserInfo {
  username: string;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  max_connections: string;
}

export type FlowError =
  | "DNS_UNAVAILABLE"
  | "INVALID_USER"
  | "INVALID_PASSWORD"
  | "ACCOUNT_EXPIRED"
  | "CONNECTION_FAILED"
  | "UNKNOWN";

export const ERROR_MESSAGES: Record<FlowError, { title: string; message: string }> = {
  DNS_UNAVAILABLE: {
    title: "Servidor indisponível",
    message: "Não encontramos o servidor (DNS). Verifique o endereço e tente novamente.",
  },
  INVALID_USER: {
    title: "Usuário inválido",
    message: "O usuário informado não existe. Confira os dados e tente de novo.",
  },
  INVALID_PASSWORD: {
    title: "Senha incorreta",
    message: "A senha informada está incorreta. Tente novamente.",
  },
  ACCOUNT_EXPIRED: {
    title: "Conta vencida",
    message: "Sua assinatura expirou. Renove com seu provedor para continuar assistindo.",
  },
  CONNECTION_FAILED: {
    title: "Falha de conexão",
    message: "Sem conexão com a internet ou o servidor não respondeu. Tente novamente.",
  },
  UNKNOWN: {
    title: "Algo deu errado",
    message: "Ocorreu um erro inesperado. Tente novamente em instantes.",
  },
};

export class FlowApiError extends Error {
  code: FlowError;
  constructor(code: FlowError) {
    super(ERROR_MESSAGES[code].message);
    this.code = code;
  }
}

export function normalizeBase(input: string): string {
  let v = input.trim().replace(/\/+$/, "");
  const isHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
  if (!/^https?:\/\//i.test(v)) {
    v = (isHttpsPage ? "https://" : "http://") + v;
  } else if (isHttpsPage && v.startsWith("http://")) {
    v = v.replace("http://", "https://");
  }
  // Remove :80 se a URL for https:// (porta 80 é HTTP puro e causa ERR_SSL_PROTOCOL_ERROR em HTTPS)
  if (v.startsWith("https://")) {
    v = v.replace(/:80(?=\/|$)/, "");
  }
  return v;
}

async function apiCall<T>(account: Account, params: Record<string, string>): Promise<T> {
  let res: Response | null = null;
  const isNative = Capacitor.isNativePlatform();
  const isHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
  let targetBase = isHttpsPage && account.base.startsWith("http://")
    ? account.base.replace("http://", "https://")
    : account.base;
  if (targetBase.startsWith("https://")) {
    targetBase = targetBase.replace(/:80(?=\/|$)/, "");
  }

  // 1. Chamada direta: se for nativo (Android) OU se o servidor for HTTPS (ex: zero1.shop)
  // Como o zero1.shop tem CORS liberado, baixar diretamente evita o limite de 6MB da Netlify Function (VOD tem 12MB!)
  if (isNative || targetBase.startsWith("https://")) {
    try {
      const url = new URL("/player_api.php", targetBase);
      url.searchParams.set("username", account.username);
      url.searchParams.set("password", account.password);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      const directRes = await fetch(url.toString(), {
        method: "GET",
        headers: isNative ? {
          "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
          "Accept": "*/*",
        } : undefined,
      });
      if (directRes && directRes.ok) {
        res = directRes;
      }
    } catch (e) {
      /* direct fetch failed (ex: CORS em outro provedor), tenta o proxy */
    }
  }

  // 2. Se a chamada direta não funcionou ou se for HTTP em página HTTP, tenta o proxy Netlify
  if (!res) {
    try {
      res = await fetch("/api/public/xtream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base: targetBase,
          path: "player_api.php",
          params: {
            username: account.username,
            password: account.password,
            ...params,
          },
        }),
      });
    } catch {
      /* ignore */
    }
  }

  // 3. Se o proxy /api/public/xtream retornar 404, tenta a rota direta de função Netlify
  if (!res || res.status === 404) {
    try {
      const netlifyFnRes = await fetch("/.netlify/functions/xtream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base: targetBase,
          path: "player_api.php",
          params: {
            username: account.username,
            password: account.password,
            ...params,
          },
        }),
      });
      if (netlifyFnRes && netlifyFnRes.ok) {
        res = netlifyFnRes;
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Se o proxy retornar erro (ex: 502 por ultrapassar 6MB da Netlify nos catálogos de filmes), tenta direto com HTTPS
  if (!res || !res.ok) {
    if (!isNative) {
      try {
        const url = new URL("/player_api.php", targetBase);
        url.searchParams.set("username", account.username);
        url.searchParams.set("password", account.password);
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
        const directRes = await fetch(url.toString());
        if (directRes && directRes.ok) {
          res = directRes;
        }
      } catch {
        /* fallback falhou */
      }
    }
  }

  if (!res || !res.ok) {
    let code: FlowError = "CONNECTION_FAILED";
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error === "DNS_UNAVAILABLE") code = "DNS_UNAVAILABLE";
      else if (err.error === "INVALID_INPUT") code = "DNS_UNAVAILABLE";
    } catch {
      /* ignore */
    }
    throw new FlowApiError(code);
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    throw new FlowApiError("UNKNOWN");
  }

  // Detect upstream errors or auth rejections
  if (payload && typeof payload === "object") {
    if ("error" in payload) {
      const err = payload as { error?: string; status?: number };
      if (err.status === 401 || err.status === 403) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth-expired"));
        }
        throw new FlowApiError("ACCOUNT_EXPIRED");
      }
      let code: FlowError = "CONNECTION_FAILED";
      if (err.error === "DNS_UNAVAILABLE" || err.error === "INVALID_INPUT") code = "DNS_UNAVAILABLE";
      else if (err.error === "UPSTREAM_ERROR") code = "CONNECTION_FAILED";
      throw new FlowApiError(code);
    }

    if (payload.user_info) {
      if (payload.user_info.auth === 0 || isAccountExpired(payload.user_info)) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth-expired"));
        }
        throw new FlowApiError("ACCOUNT_EXPIRED");
      }
    }
    if (payload.auth === 0) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-expired"));
      }
      throw new FlowApiError("ACCOUNT_EXPIRED");
    }
  }

  return payload as T;
}


export function parseExpiryDate(expDate: string | number | null | undefined): number | null {
  if (!expDate || expDate === "null" || expDate === "0" || expDate === 0 || expDate === "unlimited") {
    return null;
  }
  if (typeof expDate === "number") {
    return expDate < 1e11 ? expDate * 1000 : expDate;
  }
  const num = Number(expDate);
  if (!Number.isNaN(num) && num > 0) {
    return num < 1e11 ? num * 1000 : num;
  }
  const parsed = Date.parse(expDate);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

export function isAccountExpired(info: UserInfo | null | undefined): boolean {
  if (!info) return false;
  if (info.auth === 0) return true;
  if (info.status) {
    const s = String(info.status).toLowerCase().trim();
    if (["expired", "banned", "disabled", "inactive", "suspended"].includes(s)) {
      return true;
    }
  }
  const expMs = parseExpiryDate(info.exp_date);
  if (expMs !== null && expMs < Date.now()) {
    return true;
  }
  return false;
}

export async function authenticate(account: Account): Promise<UserInfo> {
  if (IS_DEMO_USER(account.username)) {
    return {
      username: account.username,
      status: "Active",
      exp_date: "4102444800",
      is_trial: "0",
      active_cons: "0",
      max_connections: "5",
    };
  }
  const data = await apiCall<{ user_info?: UserInfo & { auth?: number } }>(account, {});
  const info = data.user_info;
  if (!info || info.auth === 0) {
    throw new FlowApiError("INVALID_USER");
  }
  if (isAccountExpired(info)) {
    throw new FlowApiError("ACCOUNT_EXPIRED");
  }
  return info;
}

export async function authenticateWithDnsFallback(
  bases: string[],
  credentials: Pick<Account, "username" | "password">,
): Promise<{ account: Account; info: UserInfo }> {
  if (IS_DEMO_USER(credentials.username)) {
    const account: Account = {
      base: "mock://demo",
      username: credentials.username.trim(),
      password: credentials.password.trim(),
    };
    const info: UserInfo = {
      username: credentials.username.trim(),
      status: "Active",
      exp_date: "4102444800",
      is_trial: "0",
      active_cons: "0",
      max_connections: "5",
    };
    return { account, info };
  }
  const isHttpsPage = typeof window !== "undefined" && window.location.protocol === "https:";
  const expandedBases: string[] = [];
  for (const b of bases) {
    const norm = normalizeBase(b);
    if (!norm) continue;
    if (isHttpsPage && norm.startsWith("http://")) {
      const httpsVersion = norm.replace("http://", "https://").replace(/:80(?=\/|$)/, "");
      expandedBases.push(httpsVersion);
    }
    expandedBases.push(norm);
  }
  const normalizedBases = Array.from(new Set(expandedBases));

  if (normalizedBases.length === 0) {
    throw new FlowApiError("DNS_UNAVAILABLE");
  }

  let preferredError: FlowApiError | null = null;
  let fallbackError: FlowApiError | null = null;

  for (const base of normalizedBases) {
    const account: Account = {
      base,
      username: credentials.username.trim(),
      password: credentials.password.trim(),
    };

    try {
      const info = await authenticate(account);
      return { account, info };
    } catch (error) {
      if (!(error instanceof FlowApiError)) {
        fallbackError = new FlowApiError("UNKNOWN");
        continue;
      }

      if (error.code === "ACCOUNT_EXPIRED" || error.code === "INVALID_USER" || error.code === "INVALID_PASSWORD") {
        preferredError = error;
      } else if (!fallbackError) {
        fallbackError = error;
      }
    }
  }

  throw preferredError ?? fallbackError ?? new FlowApiError("UNKNOWN");
}

// ---------- Content types ----------
export interface Category {
  category_id: string;
  category_name: string;
  parent_id?: number;
}

export interface LiveStream {
  stream_id: number;
  name: string;
  stream_icon: string;
  category_id: string;
  epg_channel_id?: string;
  num?: number;
}

export interface VodStream {
  stream_id: number;
  name: string;
  stream_icon: string;
  category_id: string;
  rating?: string;
  added?: string;
  container_extension?: string;
}

export interface SeriesItem {
  series_id: number;
  name: string;
  cover: string;
  cover_big?: string;
  movie_image?: string;
  stream_icon?: string;
  poster_path?: string;
  image?: string;
  category_id: string;
  rating?: string;
  plot?: string;
  releaseDate?: string;
}

export interface SeriesEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info?: { duration_secs?: number; movie_image?: string; plot?: string };
  season?: number;
}

export interface SeriesInfo {
  info: { name?: string; cover?: string; plot?: string; genre?: string; rating?: string; releaseDate?: string };
  seasons: { season_number: number; name?: string }[];
  episodes: Record<string, SeriesEpisode[]>;
}

export interface VodInfo {
  info: {
    movie_image?: string;
    plot?: string;
    genre?: string;
    rating?: string;
    duration?: string;
    releasedate?: string;
    cast?: string;
    director?: string;
    backdrop_path?: string[];
    youtube_trailer?: string;
  };
  movie_data: { stream_id: number; name: string; container_extension: string };
}

// ---------- Content fetchers ----------
function normalizeCategories(list: unknown): Category[] {
  const arr = getArrayFromData(list);
  return arr.map((item) => item as Category);
}

export const getLiveCategories = async (a: Account) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") return DEMO_LIVE_CATS;
  const data = await apiCall<unknown>(a, { action: "get_live_categories" });
  console.log("getLiveCategories received:", data);
  return normalizeCategories(data);
};
export const getVodCategories = async (a: Account) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") return DEMO_VOD_CATS;
  const data = await apiCall<unknown>(a, { action: "get_vod_categories" });
  console.log("getVodCategories received:", data);
  return normalizeCategories(data);
};
export const getSeriesCategories = async (a: Account) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") return DEMO_SERIES_CATS;
  const data = await apiCall<unknown>(a, { action: "get_series_categories" });
  console.log("getSeriesCategories received:", data);
  return normalizeCategories(data);
};

export const getLiveStreams = async (a: Account, categoryId?: string) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return categoryId ? DEMO_LIVE_STREAMS.filter(s => s.category_id === categoryId) : DEMO_LIVE_STREAMS;
  }
  const data = await apiCall<unknown>(a, {
    action: "get_live_streams",
    ...(categoryId ? { category_id: categoryId } : {}),
  });
  console.log("getLiveStreams received:", data);
  return normalizeLiveStreams(data, a.base);
};
export const getVodStreams = async (a: Account, categoryId?: string) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return categoryId ? DEMO_VOD_STREAMS.filter(s => s.category_id === categoryId) : DEMO_VOD_STREAMS;
  }
  const data = await apiCall<unknown>(a, {
    action: "get_vod_streams",
    ...(categoryId ? { category_id: categoryId } : {}),
  });
  console.log("getVodStreams received:", data);
  const all = normalizeVodStreams(data, a.base);
  // Filtrar conteúdo 4K/UHD/HDR/Dolby Vision (incompatível sem GPU dedicada)
  const is4K = (name: string) => /\b(4k|uhd|2160p|hevc|h\.?265|hdr|dolby|\[dv\]|\[hdr\])/i.test(name || "");
  return all.filter((m) => !is4K(m.name || "") && !is4K(m.title || ""));
};
export const getSeries = async (a: Account, categoryId?: string) => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return categoryId ? DEMO_SERIES.filter(s => s.category_id === categoryId) : DEMO_SERIES;
  }
  const data = await apiCall<unknown>(a, {
    action: "get_series",
    ...(categoryId ? { category_id: categoryId } : {}),
  });
  console.log("getSeries received:", data);
  return normalizeSeriesList(data, a.base);
};

export const getVodInfo = async (a: Account, vodId: number): Promise<VodInfo> => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return {
      info: {
        movie_image: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg",
        plot: "Big Buck Bunny tells the story of a giant rabbit with a heart bigger than himself.",
        genre: "Animation, Short, Comedy",
        rating: "8.5",
        duration: "10 min",
        releasedate: "2008-04-10",
        cast: "Big Buck Bunny, Jan Morgenstern",
        director: "Sacha Goedegebure",
        backdrop_path: ["https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg"]
      },
      movie_data: { stream_id: vodId, name: "Big Buck Bunny", container_extension: "mp4" }
    };
  }
  return normalizeVodInfo(await apiCall<VodInfo>(a, { action: "get_vod_info", vod_id: String(vodId) }), a.base);
};
export const getSeriesInfo = async (a: Account, seriesId: number): Promise<SeriesInfo> => {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return {
      info: {
        name: "Blender Open Creations",
        cover: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg",
        plot: "Open source animated short films by the Blender Institute.",
        genre: "Animation, Sci-Fi, Fantasy",
        rating: "9.0",
        releaseDate: "2010"
      },
      seasons: [{ season_number: 1, name: "Season 1" }],
      episodes: {
        "1": [
          { id: "1001", episode_num: 1, title: "Episode 1 - Sintel", container_extension: "mp4", info: { duration_secs: 900, plot: "A lonely young woman searches for a dragon." } },
          { id: "1002", episode_num: 2, title: "Episode 2 - Tears of Steel", container_extension: "mp4", info: { duration_secs: 720, plot: "Set in a dystopian future in Amsterdam." } }
        ]
      }
    };
  }
  return normalizeSeriesInfo(await apiCall<SeriesInfo>(a, { action: "get_series_info", series_id: String(seriesId) }), a.base);
};

function normalizeMediaUrl(url: string | undefined, base: string): string {
  const raw = (url ?? "").trim().replace(/\\\//g, "/");
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) {
    try {
      return `${new URL(base).protocol}${raw}`;
    } catch {
      return `https:${raw}`;
    }
  }
  try {
    return new URL(raw, `${base.replace(/\/+$/, "")}/`).toString();
  } catch {
    return raw;
  }
}

function getArrayFromData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if ("data" in data && Array.isArray(data.data)) return data.data;
    if ("streams" in data && Array.isArray(data.streams)) return data.streams;
    if ("series" in data && Array.isArray(data.series)) return data.series;
    if ("categories" in data && Array.isArray(data.categories)) return data.categories;
  }
  return [];
}

function normalizeLiveStreams(list: unknown, base: string): LiveStream[] {
  const arr = getArrayFromData(list);
  return arr.map((item) => {
    const stream = item as LiveStream;
    return { ...stream, stream_icon: normalizeMediaUrl(stream.stream_icon, base) };
  });
}

function normalizeVodStreams(list: unknown, base: string): VodStream[] {
  const arr = getArrayFromData(list);
  return arr.map((item) => {
    const vod = item as VodStream;
    return { ...vod, stream_icon: normalizeMediaUrl(vod.stream_icon, base) };
  });
}

function normalizeSeriesList(list: unknown, base: string): SeriesItem[] {
  const arr = getArrayFromData(list);
  return arr.map((item) => {
    const series = item as SeriesItem;
    const cover = series.cover || series.cover_big || series.movie_image || series.stream_icon || series.poster_path || series.image;
    return {
      ...series,
      cover: normalizeMediaUrl(cover, base),
      cover_big: normalizeMediaUrl(series.cover_big, base),
      movie_image: normalizeMediaUrl(series.movie_image, base),
      stream_icon: normalizeMediaUrl(series.stream_icon, base),
      poster_path: normalizeMediaUrl(series.poster_path, base),
      image: normalizeMediaUrl(series.image, base),
    };
  });
}

function normalizeVodInfo(data: VodInfo, base: string): VodInfo {
  return {
    ...data,
    info: {
      ...data.info,
      movie_image: normalizeMediaUrl(data.info?.movie_image, base),
      backdrop_path: data.info?.backdrop_path?.map((url) => normalizeMediaUrl(url, base)),
    },
  };
}

function normalizeSeriesInfo(data: SeriesInfo, base: string): SeriesInfo {
  const episodes = Object.fromEntries(
    Object.entries(data.episodes ?? {}).map(([season, eps]) => [
      season,
      eps.map((ep) => ({
        ...ep,
        info: ep.info ? { ...ep.info, movie_image: normalizeMediaUrl(ep.info.movie_image, base) } : ep.info,
      })),
    ]),
  );
  return {
    ...data,
    info: { ...data.info, cover: normalizeMediaUrl(data.info?.cover, base) },
    episodes,
  };
}

// ---------- Stream URL builders ----------
// The app runs on HTTPS but Xtream streams are usually plain HTTP. Browsers
// block mixed content, so we route every stream through the HTTPS media proxy.
// For HLS (.m3u8) the proxy rewrites child URLs too; we keep the .m3u8 suffix
// in the proxied URL so the player still detects HLS.
// Cover/poster images from Xtream panels are usually plain HTTP. The app runs
// on HTTPS, so the browser blocks them as mixed content and the images never
// appear. Route HTTP images through the HTTPS media proxy so they always load.
export function proxiedImage(url?: string): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (!u) return undefined;
  if (Capacitor.isNativePlatform()) return u;
  return imageCandidates(url)[0];
}

export function imageCandidates(url?: string): string[] {
  if (!url) return [];
  const u = url.trim();
  if (!u) return [];
  if (u.startsWith("data:") || u.startsWith("blob:")) return [u];
  if (u.startsWith("http://image.tmdb.org")) {
    return [u.replace("http://image.tmdb.org", "https://image.tmdb.org")];
  }
  if (u.startsWith("https://")) {
    return [u];
  }
  // No navegador web sob HTTPS: imagens HTTP de servidores IPTV são bloqueadas por Mixed Content.
  // Encaminha pelo proxy do Cloudflare Worker com cache.
  if (typeof window !== "undefined" && !Capacitor.isNativePlatform() && u.startsWith("http://")) {
    return [`/api/public/stream?kind=image&url=${encodeURIComponent(u)}`, u];
  }
  return [u];
}

function proxiedUrl(absoluteUrl: string, forceTranscode = false): string {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) {
    return absoluteUrl;
  }
  if (forceTranscode) {
    return `/api/public/transcode.m3u8?url=${encodeURIComponent(absoluteUrl)}`;
  }
  // No navegador web em HTTPS: se a URL do stream for HTTP, o navegador bloqueia (Mixed Content).
  // Sempre encaminha streams HTTP pelo proxy seguro /api/public/stream do Cloudflare Worker.
  const isHls = /\.m3u8($|\?)/i.test(absoluteUrl);
  const path = isHls ? "/api/public/stream.m3u8" : "/api/public/stream";
  const ext = isHls ? "&ext=.m3u8" : "";
  return `${path}?url=${encodeURIComponent(absoluteUrl)}${ext}`;
}

export function liveStreamUrl(a: Account, streamId: number): string {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  }
  return proxiedUrl(
    `${a.base}/live/${encodeURIComponent(a.username)}/${encodeURIComponent(a.password)}/${streamId}.m3u8`,
  );
}
export function vodStreamUrl(a: Account, streamId: number, ext = "mp4", title = ""): string {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    if (streamId === 202) return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4";
    if (streamId === 203) return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4";
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  }
  const cleanExt = (ext || "mp4").toLowerCase().replace(/^\./, "");
  const rawUrl = `${a.base}/movie/${encodeURIComponent(a.username)}/${encodeURIComponent(a.password)}/${streamId}.${cleanExt}`;
  return proxiedUrl(rawUrl);
}
export function seriesStreamUrl(a: Account, episodeId: string, ext = "mp4", title = ""): string {
  if (IS_DEMO_USER(a.username) || a.base === "mock://demo") {
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4";
  }
  const cleanExt = (ext || "mp4").toLowerCase().replace(/^\./, "");
  const rawUrl = `${a.base}/series/${encodeURIComponent(a.username)}/${encodeURIComponent(a.password)}/${episodeId}.${cleanExt}`;
  return proxiedUrl(rawUrl);
}
