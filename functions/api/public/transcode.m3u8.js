// Cloudflare Pages Function: /api/public/stream
// Server-side media proxy for IPTV streams, HLS playlists (.m3u8), video chunks, and posters.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return onRequestOptions();
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing url param", { status: 400 });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(target);
    if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
      return new Response("Invalid protocol", { status: 400 });
    }
  } catch {
    return new Response("Invalid target URL", { status: 400 });
  }

  const looksLikeImage =
    url.searchParams.get("kind") === "image" ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);

  const isHls = /\.m3u8($|\?)/i.test(target);

  const upstreamHeaders = new Headers({
    "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
    Accept: looksLikeImage
      ? "image/*,*/*;q=0.8"
      : "*/*",
    Referer: `${parsedTarget.origin}/`,
  });

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader && !looksLikeImage && !isHls) {
    upstreamHeaders.set("Range", rangeHeader);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });

    // If it's an HLS playlist, rewrite relative and absolute paths to pass through this proxy
    if (isHls && upstream.ok) {
      const playlistText = await upstream.text();
      const lines = playlistText.split(/\r?\n/);
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
            try {
              const abs = new URL(uri, target).toString();
              return `URI="/api/public/stream?url=${encodeURIComponent(abs)}"`;
            } catch {
              return _m;
            }
          });
        }
        try {
          const abs = new URL(trimmed, target).toString();
          return `/api/public/stream?url=${encodeURIComponent(abs)}`;
        } catch {
          return line;
        }
      }).join("\n");

      const resHeaders = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(corsHeaders)) {
        resHeaders.set(k, v);
      }
      resHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      return new Response(rewritten, {
        status: 200,
        headers: resHeaders,
      });
    }

    // Direct stream response
    const resHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      resHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, {
      status: 502,
      headers: corsHeaders,
    });
  }
}
