// Cloudflare Worker: Entry point for FLOW TV
// Handles /api/public/xtream, /api/public/stream, client-error, backend proxying, and static assets from dist/client

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, HEAD, PUT, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. Rota de log de erro de cliente (/api/public/client-error)
    if (url.pathname === "/api/public/client-error") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2. Proxy para /api/public/xtream (Chamadas da API Xtream Codes para evitar CORS)
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

    // 3. Proxy de Streaming e Mídia (/api/public/stream e /api/public/stream.m3u8)
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
      if (rangeHeader && !looksLikeImage) {
        upstreamHeaders.set("Range", rangeHeader);
      }

      try {
        const upstream = await fetch(target, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: upstreamHeaders,
          redirect: "follow",
        });

        const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();
        const isRealHls = isHls && (
          contentType.includes("mpegurl") ||
          contentType.includes("x-mpegurl") ||
          contentType.includes("text/") ||
          (!contentType.includes("video/") && !contentType.includes("octet-stream") && !contentType.includes("binary/"))
        );

        // Se for playlist HLS de verdade (.m3u8), reescreve as rotas para o proxy HTTPS
        if (isRealHls && upstream.ok) {
          const playlistText = await upstream.text();
          const baseUrl = upstream.url || target;
          const lines = playlistText.split(/\r?\n/);
          const rewritten = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith("#")) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                try {
                  const abs = new URL(uri, baseUrl).toString();
                  return `URI="/api/public/stream?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return _m;
                }
              });
            }
            try {
              const abs = new URL(trimmed, baseUrl).toString();
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
          resHeaders.set("Cache-Control", "no-store");
          return new Response(rewritten, { status: 200, headers: resHeaders });
        }

        // Para mídia binária (MP4, TS, MKV, imagens, etc.): Streaming contínuo preservando headers de Range
        const passHeaders = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "cache-control",
          "etag",
          "last-modified",
          "content-disposition",
        ];

        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(corsHeaders)) {
          resHeaders.set(k, v);
        }
        for (const h of passHeaders) {
          const v = upstream.headers.get(h);
          if (v) resHeaders.set(h, v);
        }
        if (!resHeaders.has("Accept-Ranges")) {
          resHeaders.set("Accept-Ranges", "bytes");
        }
        if (looksLikeImage) {
          resHeaders.set("Cache-Control", "public, max-age=604800, immutable");
        }

        return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
      } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 502, headers: corsHeaders });
      }
    }

    // 4. Rota transcode.m3u8 (requer servidor Express backend com ffmpeg)
    if (url.pathname.startsWith("/api/public/transcode")) {
      if (env.API_ORIGIN) {
        const backendUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
        return fetch(new Request(backendUrl, request));
      }
      return new Response(
        JSON.stringify({
          error: "TRANSCODE_SERVICE_UNAVAILABLE",
          message: "O serviço de transcodificação em tempo real requer backend dedicado com FFmpeg. Configure API_ORIGIN nas variáveis de ambiente.",
        }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 5. Encaminhamento de rotas de API do backend (/api/*)
    if (url.pathname.startsWith("/api/")) {
      // Se houver um backend Express hospedado configurado via API_ORIGIN:
      if (env.API_ORIGIN) {
        try {
          const backendUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
          const fwdHeaders = new Headers(request.headers);
          fwdHeaders.set("X-Forwarded-Host", url.host);
          fwdHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

          const backendReq = new Request(backendUrl.toString(), {
            method: request.method,
            headers: fwdHeaders,
            body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
            redirect: "follow",
          });

          const backendRes = await fetch(backendReq);
          const resHeaders = new Headers(backendRes.headers);
          for (const [k, v] of Object.entries(corsHeaders)) {
            resHeaders.set(k, v);
          }
          return new Response(backendRes.body, {
            status: backendRes.status,
            headers: resHeaders,
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "BACKEND_UNREACHABLE", message: `Falha ao conectar ao backend: ${e.message}` }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }

      // Se não houver backend hospedado configurado:
      // O app FLOW TV usa Supabase e Xtream Codes diretamente no frontend para login e catálogo.
      // Retorna 404 JSON estruturado com instrução clara em vez de 500 ou HTML SPA.
      return new Response(
        JSON.stringify({
          error: "BACKEND_NOT_CONFIGURED",
          message: "Nenhum backend Express configurado em API_ORIGIN. A sincronização em nuvem é executada via Supabase.",
          path: url.pathname,
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 6. Entrega de arquivos estáticos da SPA (Assets) com fallback index.html para TanStack Router
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
