import { AppDatabase } from './database.js';
import { BossMode, BossRecord, KillLogRecord } from '../domain/types.js';

interface BossRow {
  id: number;
  guild_id: string;
  name: string;
  name_lower: string;
  mode: BossMode;
  category: string;
  location: string | null;
  respawn_minutes: number | null;
  respawn_max_minutes: number | null;
  schedule_days: string | null;
  schedule_times: string | null;
  schedule_interval_days: number | null;
  schedule_anchor_date: string | null;
  lead_minutes: string | null;
  mention_target: string | null;
  enabled: number;
  last_killed_at: number | null;
  last_killed_by: string | null;
  manual_next_at: number | null;
  manual_next_end_at: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface KillLogRow {
  id: number;
  boss_id: number;
  guild_id: string;
  killed_at: number;
  reported_by: string;
  source: KillLogRecord['source'];
  note: string | null;
  created_at: number;
}

function parseJsonArray<T>(raw: string | null): T[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function mapBossRow(row: BossRow): BossRecord {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    mode: row.mode,
    category: row.category,
    location: row.location,
    respawnMinutes: row.respawn_minutes,
    respawnMaxMinutes: row.respawn_max_minutes,
    scheduleDays: parseJsonArray<number>(row.schedule_days),
    scheduleTimes: parseJsonArray<string>(row.schedule_times),
    scheduleIntervalDays: row.schedule_interval_days,
    scheduleAnchorDate: row.schedule_anchor_date,
    leadMinutes: parseJsonArray<number>(row.lead_minutes),
    mentionTarget: row.mention_target,
    enabled: row.enabled === 1,
    lastKilledAt: row.last_killed_at,
    lastKilledBy: row.last_killed_by,
    manualNextAt: row.manual_next_at,
    manualNextEndAt: row.manual_next_end_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKillLogRow(row: KillLogRow): KillLogRecord {
  return {
    id: row.id,
    bossId: row.boss_id,
    guildId: row.guild_id,
    killedAt: row.killed_at,
    reportedBy: row.reported_by,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  };
}

export interface CreateBossInput {
  guildId: string;
  name: string;
  mode: BossMode;
  category?: string;
  location?: string | null;
  respawnMinutes?: number | null;
  respawnMaxMinutes?: number | null;
  scheduleDays?: number[] | null;
  scheduleTimes?: string[] | null;
  scheduleIntervalDays?: number | null;
  scheduleAnchorDate?: string | null;
  leadMinutes?: number[] | null;
  mentionTarget?: string | null;
  enabled?: boolean;
  notes?: string | null;
}

export interface UpdateBossInput {
  name?: string;
  mode?: BossMode;
  category?: string;
  location?: string | null;
  respawnMinutes?: number | null;
  respawnMaxMinutes?: number | null;
  scheduleDays?: number[] | null;
  scheduleTimes?: string[] | null;
  scheduleIntervalDays?: number | null;
  scheduleAnchorDate?: string | null;
  leadMinutes?: number[] | null;
  mentionTarget?: string | null;
  enabled?: boolean;
  notes?: string | null;
}

export class BossRepo {
  constructor(private readonly db: AppDatabase) {}

  listByGuild(guildId: string, onlyEnabled = false): BossRecord[] {
    const sql = onlyEnabled
      ? 'SELECT * FROM bosses WHERE guild_id = ? AND enabled = 1 ORDER BY name_lower ASC'
      : 'SELECT * FROM bosses WHERE guild_id = ? ORDER BY name_lower ASC';
    const rows = this.db.prepare(sql).all(guildId) as BossRow[];
    return rows.map(mapBossRow);
  }

  getById(id: number, guildId?: string): BossRecord | null {
    const row = guildId
      ? (this.db
          .prepare('SELECT * FROM bosses WHERE id = ? AND guild_id = ?')
          .get(id, guildId) as BossRow | undefined)
      : (this.db.prepare('SELECT * FROM bosses WHERE id = ?').get(id) as
          | BossRow
          | undefined);
    return row ? mapBossRow(row) : null;
  }

  getByName(guildId: string, name: string): BossRecord | null {
    const row = this.db
      .prepare('SELECT * FROM bosses WHERE guild_id = ? AND name_lower = ?')
      .get(guildId, name.trim().toLowerCase()) as BossRow | undefined;
    return row ? mapBossRow(row) : null;
  }

  findByNameOrPrefix(guildId: string, query: string): BossRecord[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.listByGuild(guildId);

    const exact = this.getByName(guildId, q);
    if (exact) return [exact];

    const rows = this.db
      .prepare(
        'SELECT * FROM bosses WHERE guild_id = ? AND name_lower LIKE ? ORDER BY name_lower ASC LIMIT 25',
      )
      .all(guildId, `%${q}%`) as BossRow[];
    return rows.map(mapBossRow);
  }

  create(input: CreateBossInput): BossRecord {
    const now = Date.now();
    const trimmedName = input.name.trim();
    const res = this.db
      .prepare(
        `INSERT INTO bosses (
          guild_id, name, name_lower, mode, category, location,
          respawn_minutes, respawn_max_minutes,
          schedule_days, schedule_times, schedule_interval_days, schedule_anchor_date,
          lead_minutes, mention_target,
          enabled, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        trimmedName,
        trimmedName.toLowerCase(),
        input.mode,
        input.category?.trim() || 'World Boss',
        input.location?.trim() || null,
        input.respawnMinutes ?? null,
        input.respawnMaxMinutes ?? null,
        input.scheduleDays ? JSON.stringify(input.scheduleDays) : null,
        input.scheduleTimes ? JSON.stringify(input.scheduleTimes) : null,
        input.scheduleIntervalDays ?? null,
        input.scheduleAnchorDate ?? null,
        input.leadMinutes ? JSON.stringify(input.leadMinutes) : null,
        input.mentionTarget ?? null,
        input.enabled === false ? 0 : 1,
        input.notes?.trim() || null,
        now,
        now,
      );

    return this.getById(Number(res.lastInsertRowid))!;
  }

  update(id: number, guildId: string, patch: UpdateBossInput): BossRecord | null {
    const existing = this.getById(id, guildId);
    if (!existing) return null;

    const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
    const nextMode = patch.mode ?? existing.mode;
    const nextCategory =
      patch.category !== undefined ? patch.category.trim() || 'World Boss' : existing.category;
    const nextLocation =
      patch.location !== undefined ? patch.location?.trim() || null : existing.location;
    const nextRespawnMin =
      patch.respawnMinutes !== undefined ? patch.respawnMinutes : existing.respawnMinutes;
    const nextRespawnMax =
      patch.respawnMaxMinutes !== undefined
        ? patch.respawnMaxMinutes
        : existing.respawnMaxMinutes;
    const nextScheduleDays =
      patch.scheduleDays !== undefined ? patch.scheduleDays : existing.scheduleDays;
    const nextScheduleTimes =
      patch.scheduleTimes !== undefined ? patch.scheduleTimes : existing.scheduleTimes;
    const nextIntervalDays =
      patch.scheduleIntervalDays !== undefined
        ? patch.scheduleIntervalDays
        : existing.scheduleIntervalDays;
    const nextAnchorDate =
      patch.scheduleAnchorDate !== undefined
        ? patch.scheduleAnchorDate
        : existing.scheduleAnchorDate;
    const nextLeadMinutes =
      patch.leadMinutes !== undefined ? patch.leadMinutes : existing.leadMinutes;
    const nextMentionTarget =
      patch.mentionTarget !== undefined ? patch.mentionTarget : existing.mentionTarget;
    const nextEnabled = patch.enabled !== undefined ? patch.enabled : existing.enabled;
    const nextNotes = patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes;
    const now = Date.now();

    this.db
      .prepare(
        `UPDATE bosses SET
          name = ?,
          name_lower = ?,
          mode = ?,
          category = ?,
          location = ?,
          respawn_minutes = ?,
          respawn_max_minutes = ?,
          schedule_days = ?,
          schedule_times = ?,
          schedule_interval_days = ?,
          schedule_anchor_date = ?,
          lead_minutes = ?,
          mention_target = ?,
          enabled = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ? AND guild_id = ?`,
      )
      .run(
        nextName,
        nextName.toLowerCase(),
        nextMode,
        nextCategory,
        nextLocation,
        nextRespawnMin,
        nextRespawnMax,
        nextScheduleDays ? JSON.stringify(nextScheduleDays) : null,
        nextScheduleTimes ? JSON.stringify(nextScheduleTimes) : null,
        nextIntervalDays,
        nextAnchorDate,
        nextLeadMinutes ? JSON.stringify(nextLeadMinutes) : null,
        nextMentionTarget,
        nextEnabled ? 1 : 0,
        nextNotes,
        now,
        id,
        guildId,
      );

    return this.getById(id, guildId);
  }

  delete(id: number, guildId: string): boolean {
    const res = this.db
      .prepare('DELETE FROM bosses WHERE id = ? AND guild_id = ?')
      .run(id, guildId);
    return res.changes > 0;
  }

  recordKill(params: {
    bossId: number;
    guildId: string;
    killedAt: number;
    reportedBy: string;
    source: KillLogRecord['source'];
    note?: string | null;
  }): BossRecord | null {
    const now = Date.now();
    const tx = this.db.transaction(() => {
      const res = this.db
        .prepare(
          `UPDATE bosses SET
            last_killed_at = ?,
            last_killed_by = ?,
            manual_next_at = NULL,
            manual_next_end_at = NULL,
            updated_at = ?
          WHERE id = ? AND guild_id = ?`,
        )
        .run(
          params.killedAt,
          params.reportedBy,
          now,
          params.bossId,
          params.guildId,
        );

      if (res.changes === 0) return null;

      this.db
        .prepare(
          `INSERT INTO kill_logs (
            boss_id, guild_id, killed_at, reported_by, source, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          params.bossId,
          params.guildId,
          params.killedAt,
          params.reportedBy,
          params.source,
          params.note?.trim() || null,
          now,
        );

      return this.getById(params.bossId, params.guildId);
    });

    return tx();
  }

  setManualTimer(params: {
    bossId: number;
    guildId: string;
    nextAt: number;
    nextEndAt?: number | null;
    reportedBy: string;
    note?: string | null;
  }): BossRecord | null {
    const now = Date.now();
    const tx = this.db.transaction(() => {
      const res = this.db
        .prepare(
          `UPDATE bosses SET
            manual_next_at = ?,
            manual_next_end_at = ?,
            updated_at = ?
          WHERE id = ? AND guild_id = ?`,
        )
        .run(
          params.nextAt,
          params.nextEndAt ?? null,
          now,
          params.bossId,
          params.guildId,
        );

      if (res.changes === 0) return null;

      this.db
        .prepare(
          `INSERT INTO kill_logs (
            boss_id, guild_id, killed_at, reported_by, source, note, created_at
          ) VALUES (?, ?, ?, ?, 'manual_set', ?, ?)`,
        )
        .run(
          params.bossId,
          params.guildId,
          now,
          params.reportedBy,
          params.note?.trim() || null,
          now,
        );

      return this.getById(params.bossId, params.guildId);
    });

    return tx();
  }

  resetTimer(bossId: number, guildId: string): BossRecord | null {
    const now = Date.now();
    const res = this.db
      .prepare(
        `UPDATE bosses SET
          last_killed_at = NULL,
          last_killed_by = NULL,
          manual_next_at = NULL,
          manual_next_end_at = NULL,
          updated_at = ?
        WHERE id = ? AND guild_id = ?`,
      )
      .run(now, bossId, guildId);

    if (res.changes === 0) return null;
    return this.getById(bossId, guildId);
  }

  listKillLogs(bossId: number, limit = 5): KillLogRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM kill_logs WHERE boss_id = ? ORDER BY killed_at DESC, id DESC LIMIT ?',
      )
      .all(bossId, limit) as KillLogRow[];
    return rows.map(mapKillLogRow);
  }

  hasAlertBeenSent(
    bossId: number,
    occurrenceKey: string,
    alertType: string,
  ): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM sent_alerts WHERE boss_id = ? AND occurrence_key = ? AND alert_type = ?',
      )
      .get(bossId, occurrenceKey, alertType);
    return row !== undefined;
  }

  markAlertSent(
    bossId: number,
    occurrenceKey: string,
    alertType: string,
    sentAt: number = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO sent_alerts (boss_id, occurrence_key, alert_type, sent_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(bossId, occurrenceKey, alertType, sentAt);
  }

  pruneOldAlerts(olderThanMs: number): number {
    const res = this.db
      .prepare('DELETE FROM sent_alerts WHERE sent_at < ?')
      .run(Date.now() - olderThanMs);
    return res.changes;
  }
}
