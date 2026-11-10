import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log("1. Criando backup completo dos dados...");
  const allUsersBackup = await prisma.user.findMany({
    include: {
      favorites: true,
      history: true,
      sessions: true,
      devices: true,
      profiles: true,
      settings: true
    }
  });
  fs.writeFileSync('/root/APP-FLOW-TV/backend/backup_users_pre_merge.json', JSON.stringify(allUsersBackup, null, 2));
  console.log(`Backup salvo com sucesso (${allUsersBackup.length} registros).\n`);

  // 2. Agrupar por username normalizado (sem espaÃ§os, minÃºsculo)
  const groups = {};
  for (const u of allUsersBackup) {
    const rawUser = u.username || u.email.split('@')[0].split('_')[0];
    const norm = rawUser.trim().toLowerCase();
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(u);
  }

  let mergedGroups = 0;
  let deletedCount = 0;

  for (const [norm, list] of Object.entries(groups)) {
    // Normalizar username do registro principal
    if (list.length === 1) {
      const u = list[0];
      const cleanUser = (u.username || norm).trim();
      if (u.username !== cleanUser) {
        await prisma.user.update({
          where: { id: u.id },
          data: { username: cleanUser }
        });
      }
      continue;
    }

    // Ordenar para escolher o melhor usuÃ¡rio principal
    list.sort((a, b) => {
      const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.sessions?.length || 0) - (a.sessions?.length || 0);
    });

    const primary = list[0];
    const duplicates = list.slice(1);
    const anyBlocked = list.some(u => u.blocked);

    console.log(`\nProcessando grupo "${norm}" (Principal: ${primary.id})...`);

    // Atualizar username e status bloqueado se aplicÃ¡vel
    const cleanUser = (primary.username || norm).trim();
    await prisma.user.update({
      where: { id: primary.id },
      data: {
        username: cleanUser,
        blocked: anyBlocked ? true : primary.blocked
      }
    });

    for (const dup of duplicates) {
      // 1. Migrar Favoritos
      for (const fav of dup.favorites) {
        const exists = await prisma.favorite.findUnique({
          where: {
            userId_contentType_contentId: {
              userId: primary.id,
              contentType: fav.contentType,
              contentId: fav.contentId
            }
          }
        });
        if (!exists) {
          await prisma.favorite.update({
            where: { id: fav.id },
            data: { userId: primary.id }
          });
        } else {
          await prisma.favorite.delete({ where: { id: fav.id } });
        }
      }

      // 2. Migrar HistÃ³rico
      for (const hist of dup.history) {
        const exists = await prisma.history.findUnique({
          where: {
            userId_contentType_contentId: {
              userId: primary.id,
              contentType: hist.contentType,
              contentId: hist.contentId
            }
          }
        });
        if (!exists) {
          await prisma.history.update({
            where: { id: hist.id },
            data: { userId: primary.id }
          });
        } else {
          if (hist.position > exists.position) {
            await prisma.history.update({
              where: { id: exists.id },
              data: {
                position: hist.position,
                duration: hist.duration,
                episodeId: hist.episodeId || exists.episodeId,
                updatedAt: hist.updatedAt
              }
            });
          }
          await prisma.history.delete({ where: { id: hist.id } });
        }
      }

      // 3. Migrar SessÃµes
      for (const sess of dup.sessions) {
        await prisma.session.update({
          where: { id: sess.id },
          data: { userId: primary.id }
        });
      }

      // 4. Migrar Devices
      for (const dev of dup.devices) {
        const exists = await prisma.device.findUnique({
          where: { deviceId: dev.deviceId }
        });
        if (exists && exists.userId !== primary.id) {
          await prisma.device.delete({ where: { id: dev.id } });
        }
      }

      // 5. Deletar perfil e settings do duplicado antes de deletar usuÃ¡rio
      await prisma.profile.deleteMany({ where: { userId: dup.id } });
      await prisma.settings.deleteMany({ where: { userId: dup.id } });

      // 6. Deletar usuÃ¡rio duplicado
      await prisma.user.delete({ where: { id: dup.id } });
      deletedCount++;
      console.log(`  - Deletado duplicado ${dup.id} (dados migrados para ${primary.id})`);
    }

    mergedGroups++;
  }

  const finalUsers = await prisma.user.findMany();
  console.log(`\n================ SUCESSO! ================\n`);
  console.log(`Grupos unificados: ${mergedGroups}`);
  console.log(`Registros duplicados removidos: ${deletedCount}`);
  console.log(`Total final de usuÃ¡rios no banco: ${finalUsers.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());