// Netlify Function (v1 classic): /api/public/stream
// Server-side media proxy for IPTV streams, HLS playlists (.m3u8), video chunks, and posters.
// Proxies video directly via HTTPS using HTTP 206 Range chunks to avoid browser Mixed Content and CORS blocking.

const PROXY_PATH = "/api/public/stream";
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunk per range request (stays well within Lambda 6MB limit)

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

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
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
    "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
    Accept: looksLikeImage
      ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8"
      : "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: `${targetOrigin}/`,
  };

  const incomingRange = event.headers?.range || event.headers?.Range;

  // Handle Range capping to stay under AWS Lambda 6MB response payload limit
  let effectiveRange = incomingRange;
  if (!looksLikeImage && incomingRange) {
    const match = incomingRange.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const requestedEnd = match[2] ? parseInt(match[2], 10) : NaN;
      if (isNaN(requestedEnd) || requestedEnd - start + 1 > CHUNK_SIZE) {
        const cappedEnd = start + CHUNK_SIZE - 1;
        effectiveRange = `bytes=${start}-${cappedEnd}`;
      }
    }
  } else if (!looksLikeImage && !incomingRange && event.httpMethod === "GET") {
    // If browser didn't supply range for video, request the first 2MB chunk
    effectiveRange = `bytes=0-${CHUNK_SIZE - 1}`;
  }

  if (effectiveRange) {
    upstreamHeaders["Range"] = effectiveRange;
  }

  try {
    const controller = new AbortController();
    const timeoutMs = looksLikeImage ? 10000 : 25000;
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

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    };

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, finalUrl);
      headers["Content-Type"] = "application/vnd.apple.mpegurl";
      headers["Cache-Control"] = "no-store";
      return { statusCode: upstream.status, headers, body: rewritten };
    }

    if (looksLikeImage) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      headers["Content-Type"] = upstream.headers.get("content-type") || "image/jpeg";
      headers["Cache-Control"] = "public, max-age=604800, immutable";
      return {
        statusCode: upstream.status,
        headers,
        isBase64Encoded: true,
        body: buf.toString("base64"),
      };
    }

    if (event.httpMethod === "HEAD") {
      headers["Content-Type"] = upstream.headers.get("content-type") || "video/mp4";
      headers["Content-Length"] = upstream.headers.get("content-length") || "0";
      headers["Accept-Ranges"] = "bytes";
      return { statusCode: upstream.status, headers, body: "" };
    }

    // Video / audio / stream: proxy the chunk directly
    const buffer = Buffer.from(await upstream.arrayBuffer());
    headers["Content-Type"] = upstream.headers.get("content-type") || "video/mp4";
    headers["Content-Length"] = String(buffer.length);
    headers["Accept-Ranges"] = "bytes";
    headers["Cache-Control"] = "no-store";

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      headers["Content-Range"] = contentRange;
    }

    return {
      statusCode: upstream.status === 200 && effectiveRange ? 206 : upstream.status,
      headers,
      isBase64Encoded: true,
      body: buffer.toString("base64"),
    };
  } catch (err) {
    return { statusCode: 502, body: "Upstream stream failed" };
  }
};
