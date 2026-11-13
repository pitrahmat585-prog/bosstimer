import { loadEnv } from './config/env.js';
import { BossRepo } from './db/bossRepo.js';
import { createDatabase } from './db/database.js';
import { GuildRepo } from './db/guildRepo.js';
import {
  createDiscordClient,
  registerClientHandlers,
} from './discord/client.js';
import { deploySlashCommands } from './discord/deployCommands.js';
import { BotContext } from './discord/types.js';
import { AlertService } from './services/alertService.js';
import { BoardService } from './services/boardService.js';
import { BossService } from './services/bossService.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDatabase(env.databasePath);

  const guildRepo = new GuildRepo(db);
  const bossRepo = new BossRepo(db);
  const bossService = new BossService(guildRepo, bossRepo);

  const client = createDiscordClient();
  const boardService = new BoardService(
    client,
    guildRepo,
    bossService,
    env.boardRefreshSec,
  );
  const alertService = new AlertService(
    client,
    guildRepo,
    bossRepo,
    boardService,
    env.schedulerIntervalSec,
  );

  const ctx: BotContext = {
    guildRepo,
    bossRepo,
    bossService,
    boardService,
    alertService,
  };

  registerClientHandlers(client, ctx);

  const shutdown = (signal: string) => {
    console.log(`[App] Menerima ${signal}, menutup bot dengan aman...`);
    alertService.stop();
    client.destroy();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (env.autoDeployCommands) {
    try {
      await deploySlashCommands(
        env.discordToken,
        env.discordClientId,
        env.discordGuildId,
      );
    } catch (deployErr) {
      console.error(
        '[Deploy] Gagal auto-register slash command saat startup (bot tetap lanjut login):',
        deployErr,
      );
    }
  }

  await client.login(env.discordToken);
}

main().catch((err) => {
  console.error('[App] Fatal startup error:', err);
  process.exit(1);
});
