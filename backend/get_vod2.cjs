const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const count = await p.dnsConnection.count();
  console.log('DnsConnection count:', count);
  const rows = await p.dnsConnection.findMany({take: 3});
  for (const r of rows) {
    console.log('DNS:', r.dnsUrl, 'user:', r.username);
    const base = r.dnsUrl.replace(/\/+$/, '');
    const apiUrl = base + '/player_api.php?username=' + r.username + '&password=' + r.password + '&action=get_vod_info&vod_id=1938503';
    try {
      const res = await fetch(apiUrl, {
        headers: {'User-Agent': 'IPTVSmartersPlayer/1.0.0'},
        signal: AbortSignal.timeout(8000)
      });
      const data = await res.json();
      const ext = (data.movie_data || {}).container_extension || 'mkv';
      const streamUrl = base + '/movie/' + r.username + '/' + r.password + '/1938503.' + ext;
      console.log('EXT:', ext);
      console.log('STREAM_URL:', streamUrl);
      const hRes = await fetch(streamUrl, {
        method: 'HEAD',
        headers: {'User-Agent': 'IPTVSmartersPlayer/1.0.0'},
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      console.log('HEAD:', hRes.status, hRes.headers.get('content-type'), 'len:', hRes.headers.get('content-length'));
    } catch(e) {
      console.log('Error:', e.message);
    }
  }
  await p.$disconnect();
}
main();
