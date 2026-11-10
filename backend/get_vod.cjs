const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.dnsConnection.findMany({take:3}).then(async r => {
  for (const a of r) {
    const u = a.username, pw = a.password, h = a.dnsUrl;
    console.log('DNS URL:', h, 'User:', u);
    const vodApiUrl = h + '/player_api.php?username=' + u + '&password=' + pw + '&action=get_vod_info&vod_id=1938503';
    try {
      const res = await fetch(vodApiUrl, {headers: {'User-Agent':'IPTVSmartersPlayer/1.0.0'}, signal: AbortSignal.timeout(10000)});
      const data = await res.json();
      const ext = (data && data.movie_data && data.movie_data.container_extension) || 'mkv';
      const direct = (data && data.movie_data && data.movie_data.direct_source) || '';
      const streamUrl = h + '/movie/' + u + '/' + pw + '/1938503.' + ext;
      console.log('EXT:', ext, 'DIRECT_SOURCE:', direct);
      console.log('STREAM_URL:', streamUrl);
      const hRes = await fetch(streamUrl, {method:'HEAD', headers:{'User-Agent':'IPTVSmartersPlayer/1.0.0'}, signal: AbortSignal.timeout(10000)});
      console.log('HEAD:', hRes.status, hRes.headers.get('content-type'), 'len:', hRes.headers.get('content-length'));
    } catch(e) {
      console.log('Error for', h, ':', e.message);
    }
  }
  await p.$disconnect();
}).catch(e => { console.error(e.message); p.$disconnect(); });
