import { BossRepo, CreateBossInput } from '../db/bossRepo.js';
import { GuildRepo } from '../db/guildRepo.js';
import { computeBossState, sortBossStates } from '../domain/schedule.js';
import {
  BossExportEntry,
  BossRecord,
  ComputedBossState,
  GuildConfig,
  KillLogRecord,
} from '../domain/types.js';
import {
  buildArchitectPresets,
  PresetPackId,
  STARTER_BOSS_PRESETS,
} from './presetData.js';

export class BossService {
  constructor(
    private readonly guildRepo: GuildRepo,
    private readonly bossRepo: BossRepo,
  ) {}

  getGuildBossStates(
    guildId: string,
    nowMs: number = Date.now(),
  ): { guild: GuildConfig; states: ComputedBossState[] } {
    const guild = this.guildRepo.getOrCreate(guildId);
    const bosses = this.bossRepo.listByGuild(guildId, false);
    const states = sortBossStates(
      bosses.map((boss) => computeBossState(boss, guild, nowMs)),
    );
    return { guild, states };
  }

  getBossState(
    guildId: string,
    bossId: number,
    nowMs: number = Date.now(),
  ): { guild: GuildConfig; state: ComputedBossState } | null {
    const guild = this.guildRepo.getOrCreate(guildId);
    const boss = this.bossRepo.getById(bossId, guildId);
    if (!boss) return null;
    return { guild, state: computeBossState(boss, guild, nowMs) };
  }

  recordKill(params: {
    guildId: string;
    bossId: number;
    killedAt: number;
    reportedBy: string;
    source: KillLogRecord['source'];
    note?: string | null;
  }): { guild: GuildConfig; state: ComputedBossState } | null {
    const guild = this.guildRepo.getOrCreate(params.guildId);
    const updated = this.bossRepo.recordKill(params);
    if (!updated) return null;
    return {
      guild,
      state: computeBossState(updated, guild, Date.now()),
    };
  }

  setManualTimer(params: {
    guildId: string;
    bossId: number;
    nextAt: number;
    nextEndAt?: number | null;
    reportedBy: string;
    note?: string | null;
  }): { guild: GuildConfig; state: ComputedBossState } | null {
    const guild = this.guildRepo.getOrCreate(params.guildId);
    const updated = this.bossRepo.setManualTimer(params);
    if (!updated) return null;
    return {
      guild,
      state: computeBossState(updated, guild, Date.now()),
    };
  }

  resetTimer(
    guildId: string,
    bossId: number,
  ): { guild: GuildConfig; state: ComputedBossState } | null {
    const guild = this.guildRepo.getOrCreate(guildId);
    const updated = this.bossRepo.resetTimer(bossId, guildId);
    if (!updated) return null;
    return {
      guild,
      state: computeBossState(updated, guild, Date.now()),
    };
  }

  seedStarterBosses(
    guildId: string,
    presetPack: PresetPackId = 'starter',
    overwriteExisting = false,
  ): { added: string[]; updated: string[]; skipped: string[] } {
    const guild = this.guildRepo.getOrCreate(guildId);
    const added: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    const presets =
      presetPack === 'starter'
        ? STARTER_BOSS_PRESETS
        : buildArchitectPresets(guild.timezone, presetPack);

    for (const preset of presets) {
      const existing = this.bossRepo.getByName(guildId, preset.name);
      if (existing) {
        if (overwriteExisting) {
          this.bossRepo.update(existing.id, guildId, {
            mode: preset.mode,
            category: preset.category,
            location: preset.location,
            respawnMinutes: preset.respawnMinutes,
            respawnMaxMinutes: preset.respawnMaxMinutes,
            scheduleDays: preset.scheduleDays,
            scheduleTimes: preset.scheduleTimes,
            scheduleIntervalDays: preset.scheduleIntervalDays ?? null,
            scheduleAnchorDate: preset.scheduleAnchorDate ?? null,
            leadMinutes: preset.leadMinutes,
            mentionTarget: preset.mentionTarget,
            enabled: preset.enabled,
            notes: preset.notes,
          });
          updated.push(preset.name);
        } else {
          skipped.push(preset.name);
        }
        continue;
      }

      this.bossRepo.create({
        guildId,
        name: preset.name,
        mode: preset.mode,
        category: preset.category,
        location: preset.location,
        respawnMinutes: preset.respawnMinutes,
        respawnMaxMinutes: preset.respawnMaxMinutes,
        scheduleDays: preset.scheduleDays,
        scheduleTimes: preset.scheduleTimes,
        scheduleIntervalDays: preset.scheduleIntervalDays ?? null,
        scheduleAnchorDate: preset.scheduleAnchorDate ?? null,
        leadMinutes: preset.leadMinutes,
        mentionTarget: preset.mentionTarget,
        enabled: preset.enabled,
        notes: preset.notes,
      });
      added.push(preset.name);
    }

    return { added, updated, skipped };
  }

  exportBosses(guildId: string): BossExportEntry[] {
    const bosses = this.bossRepo.listByGuild(guildId, false);
    return bosses.map((b) => ({
      name: b.name,
      mode: b.mode,
      category: b.category,
      location: b.location,
      respawnMinutes: b.respawnMinutes,
      respawnMaxMinutes: b.respawnMaxMinutes,
      scheduleDays: b.scheduleDays,
      scheduleTimes: b.scheduleTimes,
      scheduleIntervalDays: b.scheduleIntervalDays,
      scheduleAnchorDate: b.scheduleAnchorDate,
      leadMinutes: b.leadMinutes,
      mentionTarget: b.mentionTarget,
      enabled: b.enabled,
      notes: b.notes,
    }));
  }

  importBosses(
    guildId: string,
    rawJson: string,
    overwriteExisting: boolean,
  ): { created: number; updated: number; errors: string[] } {
    this.guildRepo.getOrCreate(guildId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('File JSON tidak valid.');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Format JSON harus berupa array daftar boss `[...]`.');
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i] as Partial<BossExportEntry> | null;
      if (!item || typeof item !== 'object') {
        errors.push(`Index ${i}: bukan object`);
        continue;
      }

      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) {
        errors.push(`Index ${i}: nama boss kosong`);
        continue;
      }

      const mode = item.mode;
      if (mode !== 'cooldown' && mode !== 'schedule') {
        errors.push(`"${name}": mode harus "cooldown" atau "schedule"`);
        continue;
      }

      if (mode === 'cooldown') {
        if (
          typeof item.respawnMinutes !== 'number' ||
          !Number.isFinite(item.respawnMinutes) ||
          item.respawnMinutes < 1
        ) {
          errors.push(`"${name}": respawnMinutes wajib angka >= 1`);
          continue;
        }
      } else {
        const hasInterval =
          typeof item.scheduleIntervalDays === 'number' &&
          Number.isFinite(item.scheduleIntervalDays) &&
          item.scheduleIntervalDays >= 2;
        const hasDays =
          Array.isArray(item.scheduleDays) && item.scheduleDays.length > 0;
        if (
          (!hasInterval && !hasDays) ||
          !Array.isArray(item.scheduleTimes) ||
          item.scheduleTimes.length === 0
        ) {
          errors.push(`"${name}": scheduleDays (atau scheduleIntervalDays) & scheduleTimes wajib diisi`);
          continue;
        }
      }

      const payload: Omit<CreateBossInput, 'guildId'> = {
        name,
        mode,
        category: typeof item.category === 'string' ? item.category : 'World Boss',
        location: typeof item.location === 'string' ? item.location : null,
        respawnMinutes:
          typeof item.respawnMinutes === 'number' ? item.respawnMinutes : null,
        respawnMaxMinutes:
          typeof item.respawnMaxMinutes === 'number'
            ? item.respawnMaxMinutes
            : null,
        scheduleDays: Array.isArray(item.scheduleDays)
          ? item.scheduleDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
          : null,
        scheduleTimes: Array.isArray(item.scheduleTimes)
          ? item.scheduleTimes.filter((t): t is string => typeof t === 'string')
          : null,
        scheduleIntervalDays:
          typeof item.scheduleIntervalDays === 'number' &&
          item.scheduleIntervalDays >= 2
            ? Math.round(item.scheduleIntervalDays)
            : null,
        scheduleAnchorDate:
          typeof item.scheduleAnchorDate === 'string'
            ? item.scheduleAnchorDate
            : null,
        leadMinutes: Array.isArray(item.leadMinutes)
          ? item.leadMinutes.filter((m): m is number => typeof m === 'number' && m > 0)
          : null,
        mentionTarget:
          typeof item.mentionTarget === 'string' ? item.mentionTarget : null,
        enabled: item.enabled !== false,
        notes: typeof item.notes === 'string' ? item.notes : null,
      };

      const existing = this.bossRepo.getByName(guildId, name);
      if (existing) {
        if (overwriteExisting) {
          this.bossRepo.update(existing.id, guildId, payload);
          updated++;
        } else {
          errors.push(`"${name}": sudah ada (lewati)`);
        }
      } else {
        this.bossRepo.create({ guildId, ...payload });
        created++;
      }
    }

    return { created, updated, errors };
  }

  resolveBossByInput(guildId: string, input: string): BossRecord | null {
    const exact = this.bossRepo.getByName(guildId, input);
    if (exact) return exact;

    const numericId = Number.parseInt(input, 10);
    if (String(numericId) === input.trim()) {
      return this.bossRepo.getById(numericId, guildId);
    }

    const matches = this.bossRepo.findByNameOrPrefix(guildId, input);
    if (matches.length === 1) return matches[0] ?? null;
    return null;
  }
}
