// Cloudflare Worker: Entry point for FLOW TV
// Handles /api/public/xtream, /api/public/stream, and static assets from dist/client

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Proxy para /api/public/xtream
    if (url.pathname === "/api/public/xtream") {
      let body;
      try {
        if (request.method === "POST") {
          body = await request.json();
        } else {
          const q = Object.fromEntries(url.searchParams.entries());
          const base = q.base;
          const path = q.path || "player_api.php";
          const params = { ...q };
          delete params.base;
          delete params.path;
          body = { base, path, params };
        }
      } catch {
        return new Response(JSON.stringify({ error: "INVALID_BODY", message: "Requisição inválida." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { base, path = "player_api.php", params = {} } = body || {};
      if (!base || typeof base !== "string") {
        return new Response(JSON.stringify({ error: "INVALID_INPUT", message: "Dados de conexão inválidos (base ausente)." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let parsedBase;
      try {
        parsedBase = new URL(base);
        if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
          return new Response(JSON.stringify({ error: "INVALID_URL", message: "Protocolo inválido." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "INVALID_URL", message: "URL base inválida." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cleanPath = String(path).replace(/^\/+/, "");
      const targetUrl = new URL(cleanPath, parsedBase.origin.endsWith("/") ? parsedBase.origin : `${parsedBase.origin}/`);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          targetUrl.searchParams.set(k, String(v));
        }
      }

      try {
        const upstream = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: {
            "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
            Accept: "application/json, text/javascript, */*; q=0.01",
          },
        });

        const data = await upstream.text();
        return new Response(data, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "application/json",
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "UPSTREAM_ERROR", message: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Proxy para /api/public/stream
    if (url.pathname.startsWith("/api/public/stream")) {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response("Missing url param", { status: 400, headers: corsHeaders });
      }

      let parsedTarget;
      try {
        parsedTarget = new URL(target);
      } catch {
        return new Response("Invalid target URL", { status: 400, headers: corsHeaders });
      }

      const looksLikeImage =
        url.searchParams.get("kind") === "image" ||
        /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);
      const isHls = /\.m3u8($|\?)/i.test(target);

      const upstreamHeaders = new Headers({
        "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
        Accept: looksLikeImage ? "image/*,*/*;q=0.8" : "*/*",
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
          return new Response(rewritten, { status: 200, headers: resHeaders });
        }

        const resHeaders = new Headers(upstream.headers);
        for (const [k, v] of Object.entries(corsHeaders)) {
          resHeaders.set(k, v);
        }
        return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
      } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 502, headers: corsHeaders });
      }
    }

    // Para qualquer outra rota: entrega arquivos estáticos (Assets) com fallback SPA (index.html)
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status === 404 && !url.pathname.includes(".")) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
};
