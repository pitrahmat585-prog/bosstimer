import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';
import { loadEnv } from '../config/env.js';
import { ALL_COMMANDS } from './commands/index.js';

export async function deploySlashCommands(
  token: string,
  clientId: string,
  guildId: string | null,
): Promise<void> {
  const rest = new REST().setToken(token);
  const body = ALL_COMMANDS.map((cmd) => cmd.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body,
    });
    console.log(
      `[Deploy] Berhasil mendaftarkan ${body.length} slash command ke guild ${guildId} (instan).`,
    );
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(
      `[Deploy] Berhasil mendaftarkan ${body.length} slash command secara global.`,
    );
  }
}

// Allow direct CLI execution via `npm run deploy`
const currentFile = fileURLToPath(import.meta.url);
const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = entryArg === currentFile;

if (isDirectRun) {
  const env = loadEnv();
  deploySlashCommands(
    env.discordToken,
    env.discordClientId,
    env.discordGuildId,
  ).catch((err) => {
    console.error('[Deploy] Gagal mendaftarkan slash commands:', err);
    process.exit(1);
  });
}
