import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      favorites: true,
      history: true,
      sessions: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  const groups = {};
  for (const u of users) {
    const rawUser = u.username || u.email.split('@')[0].split('_')[0];
    const norm = rawUser.trim().toLowerCase();
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(u);
  }

  console.log(`Total de usuarios unicos: ${Object.keys(groups).length}`);
  console.log(`Total de registros no banco: ${users.length}`);

  for (const [norm, list] of Object.entries(groups)) {
    if (list.length > 1) {
      list.sort((a, b) => {
        // If one is explicitly blocked, keep blocked = true
        const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.sessions?.length || 0) - (a.sessions?.length || 0);
      });

      const anyBlocked = list.some(u => u.blocked);
      const primary = list[0];
      const duplicates = list.slice(1);

      console.log(`\nGrupo "${norm}":`);
      console.log(`  -> MANTER (Principal): ID ${primary.id} | User: "${primary.username}" | Ultimo: ${primary.lastActiveAt} | Bloqueado: ${anyBlocked ? 'SIM (unificado)' : 'NAO'}`);
      for (const dup of duplicates) {
        console.log(`  -> UNIFICAR E APAGAR: ID ${dup.id} | User: "${dup.username}" | Ultimo: ${dup.lastActiveAt} | Favs: ${dup.favorites.length} | Hist: ${dup.history.length}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());