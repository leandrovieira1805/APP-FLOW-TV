import { createFileRoute } from "@tanstack/react-router";

// FLOW TV — server-side media proxy.
// The app is served over HTTPS, but Xtream panels usually serve streams over
// plain HTTP. Browsers block "mixed content", so the player would just spin.
// This route fetches the upstream media server-side and streams it back over
// HTTPS. For HLS playlists (.m3u8) we rewrite child URLs so segments and
// sub-playlists also flow through this proxy.

const PROXY_PATH = "/api/public/stream";

function isHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function proxify(absoluteUrl: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteM3u8(playlist: string, baseUrl: string): string {
  const lines = playlist.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Rewrite URI="..." attributes (keys, audio/subtitle renditions, maps).
    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
        try {
          const abs = new URL(uri, baseUrl).toString();
          return `URI="${proxify(abs)}"`;
        } catch {
          return _m;
        }
      });
    }

    // Plain segment / sub-playlist line.
    try {
      const abs = new URL(trimmed, baseUrl).toString();
      return proxify(abs);
    } catch {
      return line;
    }
  });
  return out.join("\n");
}

const passHeaders = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
];

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
          },
        }),
      GET: async ({ request }) => handle(request),
      HEAD: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  if (!target || !isHttpUrl(target)) {
    return new Response("Invalid url", { status: 400 });
  }

  const targetOrigin = new URL(target).origin;
  const looksLikeImage = reqUrl.searchParams.get("kind") === "image" || /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: looksLikeImage ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" : "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: `${targetOrigin}/`,
    "Upgrade-Insecure-Requests": "1",
  };
  if (!looksLikeImage) upstreamHeaders.Origin = targetOrigin;
  const range = request.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    const controller = new AbortController();
    // Timeout de 30s para streams, 10s para imagens
    const timeoutMs = looksLikeImage ? 10000 : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    upstream = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
  } catch {
    return new Response("Upstream connection failed", { status: 502 });
  }

  const finalUrl = upstream.url || target;
  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const isPlaylist =
    (contentType.includes("mpegurl") || contentType.includes("x-mpegurl")) ||
    (/\.m3u8($|\?)/i.test(finalUrl) && 
     !contentType.includes("video/") && 
     !contentType.includes("application/octet-stream") &&
     !contentType.includes("binary/"));

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");

  if (isPlaylist) {
    const text = await upstream.text();
    // Resolve relative URLs against the final (post-redirect) URL when available.
    const baseUrl = upstream.url || target;
    const rewritten = rewriteM3u8(text, baseUrl);
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    headers.set("Cache-Control", "no-store");
    return new Response(rewritten, { status: upstream.status, headers });
  }

  // Binary media — stream through, forwarding range-related headers.
  for (const h of passHeaders) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");
  
  // Cache para imagens: 7 dias
  if (looksLikeImage) {
    headers.set("Cache-Control", "public, max-age=604800, immutable");
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

