import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      favorites: true,
      history: true,
      sessions: true,
      devices: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const map = {};
  for (const u of users) {
    const rawUser = u.username || u.email.split('@')[0].split('_')[0];
    const norm = rawUser.trim().toLowerCase();
    if (!map[norm]) map[norm] = [];
    map[norm].push(u);
  }

  console.log('=== GRUPOS COM DUPLICADOS ===');
  let totalDuplicates = 0;
  for (const [key, group] of Object.entries(map)) {
    if (group.length > 1) {
      console.log(`\nUsuario: "${key}" (${group.length} registros no banco):`);
      group.forEach(u => {
        console.log(`  - ID: ${u.id}`);
        console.log(`    Username exato: "${u.username}" | Email: "${u.email}"`);
        console.log(`    Bloqueado: ${u.blocked} | Criado: ${u.createdAt} | Ultimo acesso: ${u.lastActiveAt}`);
        console.log(`    Favoritos: ${u.favorites.length} | Historico: ${u.history.length} | Sessoes: ${u.sessions.length}`);
      });
      totalDuplicates += (group.length - 1);
    }
  }
  console.log(`\nTotal de registros duplicados a unificar/remover: ${totalDuplicates}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());