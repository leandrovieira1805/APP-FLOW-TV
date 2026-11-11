// Netlify Function: /api/public/stream
// Server-side media proxy for IPTV streams, HLS playlists (.m3u8), and posters to avoid Mixed Content / CORS.

const PROXY_PATH = "/api/public/stream";

function isHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function proxify(absoluteUrl) {
  return `${PROXY_PATH}?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteM3u8(playlist, baseUrl) {
  const lines = playlist.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        try {
          const abs = new URL(uri, baseUrl).toString();
          return `URI="${proxify(abs)}"`;
        } catch {
          return _m;
        }
      });
    }

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

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
      },
      body: "",
    };
  }

  const q = event.queryStringParameters || {};
  const target = q.url;
  if (!target || !isHttpUrl(target)) {
    return { statusCode: 400, body: "Invalid url" };
  }

  let targetOrigin = "";
  try {
    targetOrigin = new URL(target).origin;
  } catch {
    return { statusCode: 400, body: "Invalid url target" };
  }

  const looksLikeImage = q.kind === "image" || /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);
  const upstreamHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: looksLikeImage ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8" : "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: `${targetOrigin}/`,
  };
  if (!looksLikeImage) upstreamHeaders.Origin = targetOrigin;
  if (event.headers && event.headers.range) upstreamHeaders["Range"] = event.headers.range;

  try {
    const controller = new AbortController();
    const timeoutMs = looksLikeImage ? 10000 : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const upstream = await fetch(target, {
      method: event.httpMethod === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const isPlaylist = (contentType.includes("mpegurl") || contentType.includes("x-mpegurl")) || /\.m3u8($|\?)/i.test(upstream.url || target);

    const headers = { "Access-Control-Allow-Origin": "*" };
    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, upstream.url || target);
      headers["Content-Type"] = "application/vnd.apple.mpegurl";
      headers["Cache-Control"] = "no-store";
      return {
        statusCode: upstream.status,
        headers,
        body: rewritten,
      };
    }

    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    if (!headers["Accept-Ranges"]) headers["Accept-Ranges"] = "bytes";

    if (looksLikeImage) {
      const buffer = await upstream.arrayBuffer();
      headers["Cache-Control"] = "public, max-age=604800, immutable";
      return {
        statusCode: upstream.status,
        headers,
        isBase64Encoded: true,
        body: Buffer.from(buffer).toString("base64"),
      };
    }

    return {
      statusCode: 302,
      headers: {
        Location: upstream.url || target,
        "Access-Control-Allow-Origin": "*",
      },
      body: "",
    };
  } catch {
    return { statusCode: 502, body: "Upstream connection failed" };
  }
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
      },
    });
  }

  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  if (!target || !isHttpUrl(target)) {
    return new Response("Invalid url", { status: 400 });
  }

  let targetOrigin = "";
  try {
    targetOrigin = new URL(target).origin;
  } catch {
    return new Response("Invalid url target", { status: 400 });
  }

  const looksLikeImage = reqUrl.searchParams.get("kind") === "image" || /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);
  const upstreamHeaders = {
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

  let upstream;
  try {
    const controller = new AbortController();
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
    const baseUrl = upstream.url || target;
    const rewritten = rewriteM3u8(text, baseUrl);
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    headers.set("Cache-Control", "no-store");
    return new Response(rewritten, { status: upstream.status, headers });
  }

  for (const h of passHeaders) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");

  if (looksLikeImage) {
    headers.set("Cache-Control", "public, max-age=604800, immutable");
  }

  return new Response(upstream.body, { status: upstream.status, headers });
};

export const config = {
  path: "/api/public/stream",
};

