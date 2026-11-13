export type BossMode = 'cooldown' | 'schedule';

export type BossStatus =
  | 'window_open'
  | 'spawned'
  | 'soon'
  | 'upcoming'
  | 'overdue'
  | 'untracked'
  | 'disabled';

export interface GuildConfig {
  guildId: string;
  timezone: string;
  alertChannelId: string | null;
  boardChannelId: string | null;
  boardMessageId: string | null;
  defaultMentionTarget: string | null; // roleId | 'everyone' | 'here' | null
  defaultLeadMinutes: number[];
  spawnGraceMinutes: number;
  managerRoleId: string | null;
  updatedAt: number;
}

export interface BossRecord {
  id: number;
  guildId: string;
  name: string;
  mode: BossMode;
  category: string;
  location: string | null;
  respawnMinutes: number | null;
  respawnMaxMinutes: number | null;
  scheduleDays: number[] | null; // 0 = Sun ... 6 = Sat
  scheduleTimes: string[] | null; // "HH:mm"
  scheduleIntervalDays: number | null; // e.g., 2 = every other day
  scheduleAnchorDate: string | null; // "YYYY-MM-DD" in guild timezone
  leadMinutes: number[] | null;
  mentionTarget: string | null; // roleId | 'everyone' | 'here' | 'none' | null (inherit guild default)
  enabled: boolean;
  lastKilledAt: number | null;
  lastKilledBy: string | null;
  manualNextAt: number | null;
  manualNextEndAt: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ComputedBossState {
  boss: BossRecord;
  status: BossStatus;
  nextSpawnAt: number | null; // start of next/active spawn or window
  windowEndAt: number | null; // end of random spawn window if applicable
  occurrenceKey: string | null;
  isManualOverride: boolean;
  effectiveLeadMinutes: number[];
  effectiveMentionTarget: string | null;
}

export interface KillLogRecord {
  id: number;
  bossId: number;
  guildId: string;
  killedAt: number;
  reportedBy: string;
  source: 'slash' | 'button' | 'modal' | 'manual_set';
  note: string | null;
  createdAt: number;
}

export interface BossExportEntry {
  name: string;
  mode: BossMode;
  category: string;
  location: string | null;
  respawnMinutes: number | null;
  respawnMaxMinutes: number | null;
  scheduleDays: number[] | null;
  scheduleTimes: string[] | null;
  scheduleIntervalDays?: number | null;
  scheduleAnchorDate?: string | null;
  leadMinutes: number[] | null;
  mentionTarget: string | null;
  enabled: boolean;
  notes: string | null;
}
