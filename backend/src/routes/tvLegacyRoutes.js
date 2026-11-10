import express from "express";
import prisma from "../config/prisma.js";

const router = express.Router();
const COOKIE = "flowtv_tv";
const XTREAM_PROXY = process.env.XTREAM_PROXY_URL || "http://127.0.0.1:82/api/public/xtream";

function html(body, title = "FLOW TV") {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:22px}
    a{color:#fff}
    .wrap{padding:26px}
    .box{max-width:520px;border:2px solid #333;background:#111;padding:22px}
    h1{font-size:42px;margin:0 0 10px}
    h2{font-size:30px;margin:0 0 16px}
    label{display:block;margin:16px 0 6px;color:#ddd}
    input,select,button{font-size:24px;padding:12px;box-sizing:border-box}
    input,select{width:100%;background:#fff;color:#000;border:2px solid #777}
    button,.btn{display:inline-block;background:#19c7a8;color:#00110e;border:0;text-decoration:none;font-weight:bold;padding:14px 22px;margin-top:18px}
    .msg{background:#3b0909;border:2px solid #8c2525;padding:12px;margin:14px 0;color:#ffd7d7}
    .top{background:#111;border-bottom:2px solid #333;padding:16px 26px}
    .top a{margin-right:18px}
    .grid{display:block}
    .channel{display:block;padding:16px;border-bottom:1px solid #333;text-decoration:none}
    .channel:focus,.channel:hover{background:#19c7a8;color:#00110e}
    .small{font-size:18px;color:#bbb}
    video{width:100%;height:auto;background:#000}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeBase(input = "") {
  let value = String(input).trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value;
}

const MAIN_CHANNEL_PATTERNS = [
  "globo",
  "sbt",
  "record",
  "band",
  "rede tv",
  "redetv",
  "tv cultura",
  "cultura",
  "gazeta",
  "aparecida",
  "futura",
  "multishow",
  "sportv",
  "premiere",
  "combate",
  "globonews",
  "gnt",
  "programaçao",
  "programacao",
];

function channelPriority(name = "") {
  const value = String(name || "").toLowerCase();
  const index = MAIN_CHANNEL_PATTERNS.findIndex((pattern) => value.includes(pattern));
  return index === -1 ? 999 : index;
}

function orderChannels(list = []) {
  return [...list].sort((a, b) => {
    const priorityA = channelPriority(a?.name);
    const priorityB = channelPriority(b?.name);
    if (priorityA !== priorityB) return priorityA - priorityB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR");
  });
}

function accountCookie(account) {
  const raw = Buffer.from(JSON.stringify(account), "utf8").toString("base64");
  return `${COOKIE}=${encodeURIComponent(raw)}; Path=/tv; Max-Age=2592000; SameSite=Lax`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/tv; Max-Age=0; SameSite=Lax`;
}

function readAccount(req) {
  const cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2),
  );
  if (!cookies[COOKIE]) return null;
  try {
    return JSON.parse(Buffer.from(decodeURIComponent(cookies[COOKIE]), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function getDnsList() {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  return (Array.isArray(config?.dnsList) ? config.dnsList : []).map(normalizeBase).filter(Boolean);
}

async function xtreamFetch(base, username, password, params = {}) {
  try {
    const response = await fetch(XTREAM_PROXY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base,
        path: "player_api.php",
        params: {
          username,
          password,
          ...params,
        },
      }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data && typeof data === "object" && !data.error) {
      return data;
    }
  } catch (e) {
    console.error("[xtreamFetch] Proxy failed, using direct fetch:", e.message);
  }

  // Direct fetch fallback from backend
  const target = new URL("player_api.php", normalizeBase(base));
  target.searchParams.set("username", username);
  target.searchParams.set("password", password);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }

  const directRes = await fetch(target.toString(), {
    headers: { Accept: "application/json" }
  });
  if (!directRes.ok) throw new Error(`Direct fetch HTTP ${directRes.status}`);
  const directData = await directRes.json();
  if (directData && typeof directData === "object" && directData.error) {
    throw new Error(directData.error);
  }
  return directData;
}

async function authenticate(username, password) {
  const dnsList = await getDnsList();
  for (const base of dnsList) {
    try {
      const data = await xtreamFetch(base, username, password);
      const info = data?.user_info;
      if (info?.auth !== 0 && String(info?.status || "").toLowerCase() === "active") {
        return { base, username, password };
      }
    } catch {
      // Try next DNS.
    }
  }
  return null;
}

router.get("/tv", (req, res) => {
  const account = readAccount(req);
  if (account) return res.redirect("/tv/channels");
  res.send(loginPage());
});

router.post("/tv/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  if (!username || !password) {
    return res.status(400).send(loginPage("Digite usuario e senha."));
  }
  const account = await authenticate(username, password);
  if (!account) {
    return res.status(401).send(loginPage("Nao foi possivel entrar. Confira usuario e senha."));
  }
  res.setHeader("Set-Cookie", accountCookie(account));
  res.redirect("/tv/channels");
});

router.get("/tv/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearCookie());
  res.redirect("/tv");
});

router.get("/tv/channels", async (req, res) => {
  let account = readAccount(req);
  if (!account) return res.redirect("/tv");

  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    
    let data;
    try {
      data = await xtreamFetch(account.base, account.username, account.password, { action: "get_live_streams" });
    } catch (e) {
      // If current DNS is down or changed in Admin database, search fallback list
      const newAccount = await authenticate(account.username, account.password);
      if (newAccount) {
        res.setHeader("Set-Cookie", accountCookie(newAccount));
        account = newAccount;
        data = await xtreamFetch(account.base, account.username, account.password, { action: "get_live_streams" });
      } else {
        throw e;
      }
    }
    const list = orderChannels(
      (Array.isArray(data) ? data : [])
      .filter((item) => !q || String(item.name || "").toLowerCase().includes(q))
      .slice(0, 300),
    );
    const featured = list.filter((item) => channelPriority(item.name) !== 999).slice(0, 24);
    const others = list.filter((item) => channelPriority(item.name) === 999);

    res.send(
      html(
        `<div class="top"><b>FLOW TV</b> <a href="/tv/logout">Sair</a></div>
<div class="wrap">
  <form method="get" action="/tv/channels">
    <input name="q" value="${escapeHtml(req.query.q || "")}" placeholder="Buscar canal">
    <button type="submit">Buscar</button>
  </form>
  <h2>Canais ao vivo</h2>
  <div class="grid">
    ${featured.length
      ? `<div class="small" style="margin:0 0 8px;color:#9fe7d8;font-weight:bold">Principais canais</div>
    ${featured
      .map(
        (item, index) =>
          `<a class="channel" href="/tv/watch/${encodeURIComponent(item.stream_id)}">${index + 1}. ${escapeHtml(item.name || "Canal")}</a>`,
      )
      .join("")}`
      : ""}
    ${others.length
      ? `<div class="small" style="margin:16px 0 8px;color:#bbb;font-weight:bold">Outros canais</div>
    ${others
      .map(
        (item, index) =>
          `<a class="channel" href="/tv/watch/${encodeURIComponent(item.stream_id)}">${featured.length + index + 1}. ${escapeHtml(item.name || "Canal")}</a>`,
      )
      .join("")}`
      : ""}
  </div>
</div>`,
        "FLOW TV - Canais",
      ),
    );
  } catch (error) {
    res.status(500).send(loginPage("Erro ao carregar canais. Tente entrar novamente."));
  }
});

router.get("/tv/watch/:id", async (req, res) => {
  let account = readAccount(req);
  if (!account) return res.redirect("/tv");

  try {
    const dnsList = await getDnsList();
    if (!dnsList.includes(account.base)) {
      const newAccount = await authenticate(account.username, account.password);
      if (newAccount) {
        res.setHeader("Set-Cookie", accountCookie(newAccount));
        account = newAccount;
      }
    }
  } catch (err) {
    // Ignore verification error and attempt to play
  }

  const streamId = String(req.params.id || "").replace(/[^0-9]/g, "");
  const streamUrl = `${account.base}/live/${encodeURIComponent(account.username)}/${encodeURIComponent(account.password)}/${streamId}.m3u8`;
  const proxied = `/api/public/stream?url=${encodeURIComponent(streamUrl)}&ext=.m3u8`;

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FLOW TV - Player</title>
  <style>
    html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
    video{display:block;width:100vw;height:100vh;background:#000;object-fit:contain}
    .bar,.hint{position:fixed;z-index:2;transition:opacity .25s ease,transform .25s ease}
    .bar{left:0;right:0;top:0;background:rgba(0,0,0,.65);padding:10px 14px;font-size:20px;display:flex;gap:8px;align-items:center}
    .bar a,.bar button{color:#fff;background:#111;border:1px solid #555;padding:8px 12px;text-decoration:none;font-size:18px}
    .hint{left:14px;bottom:14px;background:rgba(0,0,0,.65);padding:8px 12px;font-size:16px;max-width:calc(100vw - 28px)}
    .hidden-ui{opacity:0;pointer-events:none;transform:translateY(-8px)}
  </style>
</head>
<body>
  <div class="bar" id="controls">
    <a href="/tv/channels">Voltar</a>
    <button type="button" onclick="openFull()">Tela cheia</button>
  </div>
  <video id="player" controls autoplay playsinline preload="metadata"></video>
  <div class="hint" id="hint">Se nao abrir tela cheia sozinho, clique em "Tela cheia".</div>
  <script src="/uploads/hls.min.js"></script>
  <script>
    var video = document.getElementById('player');
    var controls = document.getElementById('controls');
    var hint = document.getElementById('hint');
    var hideTimer = null;
    var retryTimer = null;
    var retryCount = 0;
    var streamSrc = ${JSON.stringify(proxied)};
    var hls = null;

    function streamUrlWithBust() {
      return streamSrc + (streamSrc.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    }

    function cleanupHls() {
      if (hls) {
        try { hls.destroy(); } catch (e) {}
        hls = null;
      }
    }

    function attachStream(url) {
      cleanupHls();
      try { video.pause(); } catch (e) {}
      try { video.removeAttribute('src'); } catch (e) {}
      try { video.load(); } catch (e) {}

      var ua = navigator.userAgent.toLowerCase();
      var isTv = /smarttv|tizen|webos|netcast|opera\s+tv|viera|philips|sony|magictv|appletv|linux\s+arm/i.test(ua);
      var canPlayNative = video.canPlayType('application/vnd.apple.mpegurl') || 
                          video.canPlayType('audio/mpegurl') || 
                          video.canPlayType('application/x-mpegurl');

      // Prefer native HLS playback on Smart TVs and Apple/Safari platforms
      if (canPlayNative) {
        video.src = url;
        try {
          var playedNative = video.play();
          if (playedNative && playedNative.catch) playedNative.catch(function() {});
        } catch (e) {}
        return;
      }

      // Use hls.js with very small buffer constraints on desktop/MSE platforms to avoid RAM exhaustion
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: false,
          enableWorker: true,
          startFragPrefetch: true,
          capLevelToPlayerSize: true,
          startLevel: -1,
          abrEwmaDefaultEstimate: 8000000,
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 8,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1024 * 1024,
          backBufferLength: 20,
          maxBufferHole: 3.5,
          manifestLoadingTimeOut: 20000,
          levelLoadingTimeOut: 20000,
          fragLoadingTimeOut: 30000,
          manifestLoadingMaxRetry: 5,
          levelLoadingMaxRetry: 5,
          fragLoadingMaxRetry: 7,
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
          if (!data || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { hls.startLoad(); } catch (e) {}
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch (e) {}
            return;
          }
          reloadStream('fatal');
        });
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          try {
            var played = video.play();
            if (played && played.catch) played.catch(function() {});
          } catch (e) {}
        });
        hls.on(Hls.Events.FRAG_LOADED, function() {
          retryCount = 0;
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        return;
      }

      video.src = url;
      try {
        var playedNative = video.play();
        if (playedNative && playedNative.catch) playedNative.catch(function() {});
      } catch (e) {}
    }

    function showUi() {
      controls.classList.remove('hidden-ui');
      hint.classList.remove('hidden-ui');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() {
        controls.classList.add('hidden-ui');
        hint.classList.add('hidden-ui');
      }, 1500);
    }

    function reloadStream(reason) {
      if (retryTimer) return;
      retryCount = Math.min(retryCount + 1, 3);
      var delay = Math.min(2000 * retryCount, 6000);
      retryTimer = setTimeout(function() {
        retryTimer = null;
        attachStream(streamUrlWithBust());
      }, delay);
    }

    function openFull(){
      var el = video;
      try {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
      } catch(e) {}
      try { video.play(); } catch(e) {}
      showUi();
    }
    attachStream(streamSrc);
    video.onclick = openFull;
    video.addEventListener('play', showUi);
    video.addEventListener('playing', function() {
      retryCount = 0;
      showUi();
    });
    video.addEventListener('waiting', showUi);
    video.addEventListener('stalled', showUi);
    video.addEventListener('error', function() { reloadStream('error'); });
    video.addEventListener('ended', function() { reloadStream('ended'); });
    video.addEventListener('touchstart', showUi, { passive: true });
    video.addEventListener('mousemove', showUi);
    video.addEventListener('keydown', showUi);
    document.addEventListener('mousemove', showUi);
    document.addEventListener('keydown', showUi);
    document.addEventListener('touchstart', showUi, { passive: true });
    showUi();
    setTimeout(openFull, 500);
  </script>
</body>
</html>`);
});

function loginPage(message = "") {
  return html(
    `<div class="wrap">
  <div class="box">
    <h1>FLOW TV</h1>
    <p>Modo TV antigo</p>
    ${message ? `<div class="msg">${escapeHtml(message)}</div>` : ""}
    <form method="post" action="/tv/login">
      <label>Usuario</label>
      <input name="username" autocomplete="username">
      <label>Senha</label>
      <input name="password" type="password" autocomplete="current-password">
      <button type="submit">Entrar</button>
    </form>
  </div>
</div>`,
    "FLOW TV - TV",
  );
}

export default router;





