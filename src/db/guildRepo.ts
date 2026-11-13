import { AppDatabase } from './database.js';
import { GuildConfig } from '../domain/types.js';

interface GuildConfigRow {
  guild_id: string;
  timezone: string;
  alert_channel_id: string | null;
  board_channel_id: string | null;
  board_message_id: string | null;
  default_mention_target: string | null;
  default_lead_minutes: string;
  spawn_grace_minutes: number;
  manager_role_id: string | null;
  updated_at: number;
}

function mapRow(row: GuildConfigRow): GuildConfig {
  let leadMinutes: number[] = [15, 5, 1];
  try {
    const parsed = JSON.parse(row.default_lead_minutes);
    if (Array.isArray(parsed)) {
      leadMinutes = parsed.filter((n): n is number => typeof n === 'number');
    }
  } catch {
    leadMinutes = [15, 5, 1];
  }

  return {
    guildId: row.guild_id,
    timezone: row.timezone,
    alertChannelId: row.alert_channel_id,
    boardChannelId: row.board_channel_id,
    boardMessageId: row.board_message_id,
    defaultMentionTarget: row.default_mention_target,
    defaultLeadMinutes: leadMinutes,
    spawnGraceMinutes: row.spawn_grace_minutes,
    managerRoleId: row.manager_role_id,
    updatedAt: row.updated_at,
  };
}

export class GuildRepo {
  constructor(private readonly db: AppDatabase) {}

  getOrCreate(guildId: string): GuildConfig {
    const existing = this.db
      .prepare('SELECT * FROM guild_configs WHERE guild_id = ?')
      .get(guildId) as GuildConfigRow | undefined;

    if (existing) {
      return mapRow(existing);
    }

    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO guild_configs (
          guild_id, timezone, default_lead_minutes, spawn_grace_minutes, updated_at
        ) VALUES (?, 'Asia/Jakarta', '[15,5,1]', 5, ?)`,
      )
      .run(guildId, now);

    const created = this.db
      .prepare('SELECT * FROM guild_configs WHERE guild_id = ?')
      .get(guildId) as GuildConfigRow;
    return mapRow(created);
  }

  listAll(): GuildConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM guild_configs')
      .all() as GuildConfigRow[];
    return rows.map(mapRow);
  }

  update(
    guildId: string,
    patch: Partial<
      Pick<
        GuildConfig,
        | 'timezone'
        | 'alertChannelId'
        | 'boardChannelId'
        | 'boardMessageId'
        | 'defaultMentionTarget'
        | 'defaultLeadMinutes'
        | 'spawnGraceMinutes'
        | 'managerRoleId'
      >
    >,
  ): GuildConfig {
    const current = this.getOrCreate(guildId);
    const next: GuildConfig = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    this.db
      .prepare(
        `UPDATE guild_configs SET
          timezone = ?,
          alert_channel_id = ?,
          board_channel_id = ?,
          board_message_id = ?,
          default_mention_target = ?,
          default_lead_minutes = ?,
          spawn_grace_minutes = ?,
          manager_role_id = ?,
          updated_at = ?
        WHERE guild_id = ?`,
      )
      .run(
        next.timezone,
        next.alertChannelId,
        next.boardChannelId,
        next.boardMessageId,
        next.defaultMentionTarget,
        JSON.stringify(next.defaultLeadMinutes),
        next.spawnGraceMinutes,
        next.managerRoleId,
        next.updatedAt,
        guildId,
      );

    return next;
  }
}
