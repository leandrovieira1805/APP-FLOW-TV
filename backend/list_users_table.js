import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { lastActiveAt: 'desc' }
  });
  
  console.log(`\n================ TOTAL DE USUARIOS REGISTRADOS: ${users.length} ================`);
  const blockedCount = users.filter(u => u.blocked).length;
  const activeCount = users.length - blockedCount;
  console.log(`Ativos: ${activeCount} | Bloqueados: ${blockedCount}\n`);

  console.log(
    '#'.padEnd(4) + 
    'ID'.padEnd(28) + 
    'USUARIO'.padEnd(16) + 
    'SERVIDOR / DNS'.padEnd(26) + 
    'STATUS'.padEnd(14) + 
    'CRIADO EM'.padEnd(20) + 
    'ULTIMO ACESSO'.padEnd(20)
  );
  console.log('-'.repeat(128));

  users.forEach((u, i) => {
    let server = '-';
    if (u.email && u.email.includes('@iptv.sync')) {
      const parts = u.email.replace('@iptv.sync', '').split('_');
      if (parts.length >= 2) {
        server = parts.slice(1).join(':');
      }
    } else if (u.email) {
      server = u.email;
    }

    const created = u.createdAt ? new Date(u.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
    const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nunca';
    const status = u.blocked ? 'ðŸ”´ BLOQUEADO' : 'ðŸŸ¢ ATIVO';

    console.log(
      String(i + 1).padEnd(4) + 
      String(u.id).padEnd(28) + 
      String(u.username || '-').padEnd(16) + 
      String(server).padEnd(26) + 
      status.padEnd(14) + 
      created.padEnd(20) + 
      lastActive.padEnd(20)
    );
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());