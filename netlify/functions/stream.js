// Netlify Function (v1 classic): /api/public/stream
// Server-side media proxy for IPTV streams, HLS playlists (.m3u8), and posters.

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

export const handler = async (event) => {
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

  const looksLikeImage =
    q.kind === "image" ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);

  const upstreamHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: looksLikeImage
      ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
      : "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: `${targetOrigin}/`,
  };
  if (!looksLikeImage) upstreamHeaders.Origin = targetOrigin;
  if (event.headers && event.headers.range)
    upstreamHeaders["Range"] = event.headers.range;

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
    const finalUrl = upstream.url || target;
    const isPlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      /\.m3u8($|\?)/i.test(finalUrl);

    const headers = { "Access-Control-Allow-Origin": "*" };

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, finalUrl);
      headers["Content-Type"] = "application/vnd.apple.mpegurl";
      headers["Cache-Control"] = "no-store";
      return { statusCode: upstream.status, headers, body: rewritten };
    }

    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    if (!headers["accept-ranges"]) headers["Accept-Ranges"] = "bytes";

    if (looksLikeImage) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      headers["Cache-Control"] = "public, max-age=604800, immutable";
      return {
        statusCode: upstream.status,
        headers,
        isBase64Encoded: true,
        body: buf.toString("base64"),
      };
    }

    // For video/binary, redirect to the upstream URL directly
    return {
      statusCode: 302,
      headers: { Location: finalUrl, "Access-Control-Allow-Origin": "*" },
      body: "",
    };
  } catch {
    return { statusCode: 502, body: "Upstream connection failed" };
  }
};

