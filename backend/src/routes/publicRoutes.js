import express from 'express';
import { Readable } from 'stream';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const router = express.Router();

// 1x1 transparent PNG fallback buffer for broken/forbidden remote images
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function isAbsolute(url) {
  return /^https?:\/\//i.test(url);
}

function resolveUrl(base, segment) {
  if (isAbsolute(segment)) return segment;
  try {
    return new URL(segment, base).href;
  } catch (e) {
    return segment;
  }
}

function rewriteM3u8(content, baseUrl) {
  const proxyBase = '/api/public/stream?url=';
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const abs = resolveUrl(baseUrl, uri);
          return `URI="${proxyBase}${encodeURIComponent(abs)}"`;
        });
      }
      if (trimmed && !trimmed.startsWith('#')) {
        const abs = resolveUrl(baseUrl, trimmed);
        return `${proxyBase}${encodeURIComponent(abs)}`;
      }
      return line;
    })
    .join('\n');
}

import http from 'http';
import https from 'https';

function proxyStreamWithRedirects(targetUrl, req, res, redirectCount = 0) {
  if (redirectCount > 5) {
    if (!res.headersSent) res.status(502).json({ error: 'Too many redirects from upstream' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  const client = parsed.protocol === 'https:' ? https : http;
  const headers = {
    'User-Agent': 'IPTVSmartersPlayer/1.0.0 (Linux; Android 10)',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  };

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const upstreamReq = client.request(targetUrl, {
    method: 'GET',
    headers: headers,
    timeout: 30000,
  }, (upstreamRes) => {
    // Follow 301/302/307 redirects
    if ((upstreamRes.statusCode === 301 || upstreamRes.statusCode === 302 || upstreamRes.statusCode === 307) && upstreamRes.headers.location) {
      let nextUrl = upstreamRes.headers.location;
      if (!/^https?:\/\//i.test(nextUrl)) {
        nextUrl = new URL(nextUrl, targetUrl).href;
      }
      upstreamReq.destroy();
      return proxyStreamWithRedirects(nextUrl, req, res, redirectCount + 1);
    }

    const statusCode = upstreamRes.statusCode || 200;
    const contentType = upstreamRes.headers['content-type'] || 'video/mp4';
    const contentLength = upstreamRes.headers['content-length'];
    const contentRange = upstreamRes.headers['content-range'];
    const isM3u8 = (req.query.ext === '.m3u8') || (contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || targetUrl.includes('.m3u8'));

    if (isM3u8) {
      let body = '';
      upstreamRes.setEncoding('utf8');
      upstreamRes.on('data', (d) => { body += d; });
      upstreamRes.on('end', () => {
        const rewritten = rewriteM3u8(body, targetUrl);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(rewritten);
      });
      return;
    }

    res.status(statusCode);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    upstreamRes.pipe(res);

    res.on('close', () => {
      try { upstreamReq.destroy(); } catch (e) {}
    });
  });

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream connection error: ' + err.message });
    }
  });

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Upstream request timeout' });
    }
  });

  upstreamReq.end();
}

router.get(['/stream', '/stream.m3u8'], (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL parameter is required' });
  proxyStreamWithRedirects(url, req, res);
});

// ---------------------------------------------------------------------------
// Server-side transcoding (ffmpeg) fallback for unsupported formats (MKV/HEVC/AVI/4K)
// ---------------------------------------------------------------------------
const TC_DIR = '/tmp/flowtv-tc';
const MAX_TRANSCODES = 4;
const TC_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de TTL // watchdog: kill idle ffmpeg after 120s
const TC_CLEANUP_MS = 10 * 60 * 1000; // remove stale dirs after 10min

const tcJobs = new Map(); // hash -> { dir, playlist, proc, lastAccess, error, exitCode }

function tcHash(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function startTranscode(url) {
  const hash = tcHash(url);
  const existing = tcJobs.get(hash);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }
  if (tcJobs.size >= MAX_TRANSCODES) {
    let oldestHash = null;
    let oldestTime = Infinity;
    for (const [h, j] of tcJobs) {
      if (j.lastAccess < oldestTime) {
        oldestTime = j.lastAccess;
        oldestHash = h;
      }
    }
    if (oldestHash) {
      const oldJob = tcJobs.get(oldestHash);
      try { oldJob.proc.kill('SIGKILL'); } catch {}
      tcJobs.delete(oldestHash);
    }
  }
  if (!fs.existsSync(TC_DIR)) fs.mkdirSync(TC_DIR, { recursive: true });
  const dir = path.join(TC_DIR, hash);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const playlist = path.join(dir, 'index.m3u8');
  
  // Fast low-latency 1080p H.264 + AAC transcode with 2s segmenting
    const args = [
    '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
    '-threads', '0',
    '-user_agent', 'IPTVSmartersPlayer/1.0.0 (Linux; Android 10)',
    '-i', url,
    '-map', '0:v:0?', '-map', '0:a:0?',
    '-sn', '-dn',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'main',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-start_number', '0',
    '-hls_segment_filename', path.join(dir, 'seg%03d.ts'),
    '-f', 'hls', playlist,
  ];
  
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const job = { dir, playlist, proc, lastAccess: Date.now(), error: null, exitCode: null };
  tcJobs.set(hash, job);
  
  let stderrBuffer = '';
  proc.stderr.on('data', (d) => {
    stderrBuffer += String(d);
    if (stderrBuffer.length > 2000) {
      stderrBuffer = stderrBuffer.slice(-2000);
    }
  });
  
  proc.on('exit', (code) => {
    job.exitCode = code;
    if (code !== 0 && !fs.existsSync(playlist)) {
      job.error = stderrBuffer || ('FFmpeg exited with error code ' + code);
    }
    if (tcJobs.get(hash) === job && code !== 0) {
      tcJobs.delete(hash);
    }
  });
  return job;
}

function readPlaylist(job) {
  try { return fs.readFileSync(job.playlist, 'utf8'); } catch { return null; }
}

function rewriteTranscodePlaylist(content, hash) {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return `/api/public/transcode-seg?d=${hash}&f=${encodeURIComponent(trimmed)}`;
      }
      return line;
    })
    .join('\n');
}

const handleTranscodeRequest = async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Valid URL parameter is required' });
  }

  let job = tcJobs.get(tcHash(url)) || startTranscode(url);
  if (!job) {
    return res.status(503).json({ error: 'Transcoding capacity reached, try again in a moment' });
  }
  job.lastAccess = Date.now();
  if (job.exitCode !== null && job.exitCode !== 0) {
    job = startTranscode(url);
    if (!job) {
      return res.status(503).json({ error: 'Transcoding capacity reached, try again in a moment' });
    }
    job.lastAccess = Date.now();
  }

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (job.error && !fs.existsSync(job.playlist)) {
      return res.status(502).json({ error: 'Transcode failed: ' + job.error.slice(0, 300) });
    }
    const content = readPlaylist(job);
    if (content && (content.includes('.ts') || content.includes('#EXTINF'))) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      return res.send(rewriteTranscodePlaylist(content, tcHash(url)));
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return res.status(502).json({ error: 'Timeout waiting for transcoded playlist' });
};

router.get('/transcode', handleTranscodeRequest);
router.get('/transcode.m3u8', handleTranscodeRequest);


// Cache de duração real dos arquivos de mídia
const durationCache = new Map();

async function probeMediaDuration(mediaUrl) {
  if (!mediaUrl) return 0;
  if (durationCache.has(mediaUrl)) return durationCache.get(mediaUrl);

  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '-user_agent', 'IPTVSmartersPlayer/1.0.0 (Linux; Android 10)',
      mediaUrl
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += String(d); });
    proc.on('close', (code) => {
      const dur = parseFloat(out.trim()) || 0;
      if (dur > 0) {
        durationCache.set(mediaUrl, dur);
      }
      resolve(dur);
    });
    proc.on('error', () => resolve(0));
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve(0);
    }, 8000);
  });
}

router.get('/duration', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Valid URL required', duration: 0 });
  }
  const dur = await probeMediaDuration(url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ duration: dur });
});


router.get('/transcode-ping', (req, res) => {
  const { d } = req.query;
  if (d) {
    const job = tcJobs.get(String(d));
    if (job) job.lastAccess = Date.now();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.json({ status: 'ok' });
});

router.get('/transcode-seg', (req, res) => {
  const { d, f } = req.query;
  if (!d || !f) return res.status(400).end();
  const hash = String(d);
  if (!/^[0-9a-f]{16}$/.test(hash)) return res.status(400).end();
  const file = String(f).replace(/[^A-Za-z0-9._-]/g, '');
  if (!file) return res.status(400).end();
  const job = tcJobs.get(hash);
  if (job) job.lastAccess = Date.now();
  const p = path.join(TC_DIR, hash, file);
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return res.status(404).end();
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', st.size);
    return fs.createReadStream(p).pipe(res);
  } catch {
    return res.status(404).end();
  }
});

// Watchdog: kill ffmpeg jobs that have been idle (client stopped fetching)
setInterval(() => {
  const now = Date.now();
  for (const [hash, job] of tcJobs) {
    if (now - job.lastAccess > TC_TTL_MS && job.exitCode === null) {
      try { job.proc.kill('SIGKILL'); } catch {}
      job.exitCode = 1;
      tcJobs.delete(hash);
    }
  }
}, 20000).unref();

// Cleanup: remove stale transcode directories
setInterval(() => {
  try {
    if (!fs.existsSync(TC_DIR)) return;
    const now = Date.now();
    for (const entry of fs.readdirSync(TC_DIR)) {
      const p = path.join(TC_DIR, entry);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory() && now - st.mtimeMs > TC_CLEANUP_MS) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  } catch {}
}, 60000).unref();

// Client error capture — logs frontend JS errors for debugging
import { appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ERROR_LOG = path.join(__dirname, '..', 'client-errors.log');

router.post('/client-error', (req, res) => {
  try {
    const entry = {
      ts: new Date().toISOString(),
      type: req.body?.type || 'error',
      message: req.body?.message || '',
      stack: req.body?.stack || '',
      url: req.body?.url || '',
      route: req.body?.route || '',
    };
    appendFileSync(CLIENT_ERROR_LOG, JSON.stringify(entry) + '\n', 'utf8');
    console.error('[CLIENT]', entry.type, entry.message);
  } catch (e) {
    /* never block the client */
  }
  res.json({ ok: true });
});

export default router;
