// Cloudflare Pages Function: /api/public/stream
// Server-side media proxy for IPTV streams, HLS playlists (.m3u8), video chunks, and posters.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, X-Playback-Session-Id",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
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
  const isMp4 = /\.(mp4|m4v|mov)($|\?)/i.test(target);
  const isTs = /\.ts($|\?)/i.test(target);

  const upstreamHeaders = new Headers({
    "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
    Accept: looksLikeImage
      ? "image/*,*/*;q=0.8"
      : "*/*",
  });

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader && !looksLikeImage && !isHls) {
    upstreamHeaders.set("Range", rangeHeader);
  }

  try {
    let currentUrl = target;
    let upstream = null;
    let redirectCount = 0;

    while (redirectCount < 6) {
      let fetchUrl = currentUrl;
      try {
        upstream = await fetch(fetchUrl, {
          method: request.method,
          headers: upstreamHeaders,
          redirect: "manual",
        });
      } catch (err) {
        // Se falhar no HTTPS (ex: certificado inválido/COMMON_NAME_INVALID comum em IPTV), tenta HTTP
        if (fetchUrl.startsWith("https://")) {
          fetchUrl = fetchUrl.replace(/^https:\/\//i, "http://");
          upstream = await fetch(fetchUrl, {
            method: request.method,
            headers: upstreamHeaders,
            redirect: "manual",
          });
        } else {
          throw err;
        }
      }

      // Se retornar erro de SSL do Cloudflare (525/526) em HTTPS, tenta via HTTP
      if ((upstream.status === 525 || upstream.status === 526) && fetchUrl.startsWith("https://")) {
        fetchUrl = fetchUrl.replace(/^https:\/\//i, "http://");
        upstream = await fetch(fetchUrl, {
          method: request.method,
          headers: upstreamHeaders,
          redirect: "manual",
        });
      }

      // Tratamento manual de redirecionamentos (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get("Location");
        if (!location) break;

        let nextUrl = new URL(location, fetchUrl).toString();
        // Em servidores IPTV, nós de streaming (edge) frequentemente usam certificados SSL auto-assinados.
        // Se redirecionar para https, tentar http caso o host seja IP ou domínio de CDN IPTV
        if (nextUrl.startsWith("https://")) {
          nextUrl = nextUrl.replace(/^https:\/\//i, "http://");
        }
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      break;
    }

    if (!upstream) {
      return new Response("Failed to fetch upstream media", { status: 502, headers: corsHeaders });
    }

    // Se for playlist HLS (.m3u8), reescreve links relativos e absolutos para passar pelo proxy
    if (isHls && upstream.ok) {
      const playlistText = await upstream.text();
      const lines = playlistText.split(/\r?\n/);
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
            try {
              const abs = new URL(uri, currentUrl).toString();
              return `URI="/api/public/stream?url=${encodeURIComponent(abs)}"`;
            } catch {
              return _m;
            }
          });
        }
        try {
          const abs = new URL(trimmed, currentUrl).toString();
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
      resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      return new Response(rewritten, {
        status: 200,
        headers: resHeaders,
      });
    }

    // Resposta de stream de mídia (MP4, TS, MKV, etc)
    const resHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      resHeaders.set(k, v);
    }

    // iOS Safari AVPlayer exige rigorosamente MIME types de vídeo suportados pela Apple
    if (isMp4) {
      resHeaders.set("Content-Type", "video/mp4");
    } else if (isHls) {
      resHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
    } else if (isTs) {
      resHeaders.set("Content-Type", "video/mp2t");
    } else if (!resHeaders.has("Content-Type") || resHeaders.get("Content-Type") === "application/octet-stream") {
      if (/\.mp4($|\?)/i.test(currentUrl)) {
        resHeaders.set("Content-Type", "video/mp4");
      }
    }

    // Garante que o suporte a Range de bytes esteja explicitamente declarado para o Safari/iOS
    resHeaders.set("Accept-Ranges", "bytes");

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
