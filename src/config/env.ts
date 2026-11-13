import 'dotenv/config';

export interface AppEnv {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | null;
  databasePath: string;
  schedulerIntervalSec: number;
  boardRefreshSec: number;
  autoDeployCommands: boolean;
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function parseAutoDeployFlag(): boolean {
  const raw = process.env.AUTO_DEPLOY_COMMANDS?.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID,
  );
}

export function loadEnv(): AppEnv {
  const discordToken = process.env.DISCORD_TOKEN?.trim() ?? '';
  const discordClientId = process.env.DISCORD_CLIENT_ID?.trim() ?? '';

  if (!discordToken) {
    throw new Error('Environment variable DISCORD_TOKEN wajib diisi di file .env');
  }
  if (!discordClientId) {
    throw new Error('Environment variable DISCORD_CLIENT_ID wajib diisi di file .env');
  }

  return {
    discordToken,
    discordClientId,
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || null,
    databasePath: process.env.DATABASE_PATH?.trim() || './data/boss-timer.db',
    schedulerIntervalSec: parsePositiveInt(process.env.SCHEDULER_INTERVAL_SEC, 10, 5),
    boardRefreshSec: parsePositiveInt(process.env.BOARD_REFRESH_SEC, 60, 15),
    autoDeployCommands: parseAutoDeployFlag(),
  };
}
