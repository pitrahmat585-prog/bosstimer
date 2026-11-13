import { DateTime } from 'luxon';
import {
  BossRecord,
  BossStatus,
  ComputedBossState,
  GuildConfig,
} from './types.js';
import { parseTimeOfDay } from './duration.js';

const SOON_THRESHOLD_MS = 30 * 60_000;
const COOLDOWN_OVERDUE_MAX_MS = 120 * 60_000;

/**
 * Finds the nearest relevant scheduled timestamp (either an active slot within graceMs,
 * or the next upcoming slot) in the given IANA timezone.
 * Supports either weekday lists (`scheduleDays`) or every-N-days cadence (`scheduleIntervalDays` + `scheduleAnchorDate`).
 */
export function findNextScheduledSpawn(
  scheduleDays: number[],
  scheduleTimes: string[],
  timezone: string,
  nowMs: number,
  graceMinutes: number,
  scheduleIntervalDays: number | null = null,
  scheduleAnchorDate: string | null = null,
): number | null {
  if (scheduleTimes.length === 0) {
    return null;
  }
  const hasInterval =
    scheduleIntervalDays !== null && scheduleIntervalDays >= 2;
  if (!hasInterval && scheduleDays.length === 0) {
    return null;
  }

  const daySet = new Set(scheduleDays);
  const parsedTimes = scheduleTimes
    .map((t) => parseTimeOfDay(t))
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (parsedTimes.length === 0) return null;

  const zone = DateTime.now().setZone(timezone).isValid ? timezone : 'Asia/Jakarta';
  const nowDt = DateTime.fromMillis(nowMs, { zone });
  const graceMs = Math.max(1, graceMinutes) * 60_000;

  let anchorDt: DateTime | null = null;
  if (hasInterval && scheduleAnchorDate) {
    const parsedAnchor = DateTime.fromISO(scheduleAnchorDate, { zone });
    if (parsedAnchor.isValid) {
      anchorDt = parsedAnchor.startOf('day');
    }
  }
  if (hasInterval && !anchorDt) {
    anchorDt = nowDt.startOf('day');
  }

  const maxLookaheadDays = hasInterval ? Math.max(8, scheduleIntervalDays! + 2) : 8;
  let earliestValid: number | null = null;

  for (let offset = -1; offset <= maxLookaheadDays; offset++) {
    const dayDt = nowDt.plus({ days: offset });

    if (hasInterval && anchorDt) {
      const diffDays = Math.round(
        dayDt.startOf('day').diff(anchorDt, 'days').days,
      );
      const mod =
        ((diffDays % scheduleIntervalDays!) + scheduleIntervalDays!) %
        scheduleIntervalDays!;
      if (mod !== 0) continue;
    } else {
      // Luxon weekday: 1 (Mon) .. 7 (Sun). Convert to JS Date 0 (Sun) .. 6 (Sat).
      const jsWeekday = dayDt.weekday % 7;
      if (!daySet.has(jsWeekday)) continue;
    }

    for (const time of parsedTimes) {
      const slotDt = dayDt.set({
        hour: time.hour,
        minute: time.minute,
        second: 0,
        millisecond: 0,
      });
      if (!slotDt.isValid) continue;

      const slotMs = slotDt.toMillis();
      // Keep slot if it hasn't passed its spawn grace period yet
      if (slotMs + graceMs > nowMs) {
        if (earliestValid === null || slotMs < earliestValid) {
          earliestValid = slotMs;
        }
      }
    }
  }

  return earliestValid;
}

export function resolveEffectiveMention(
  boss: BossRecord,
  guild: GuildConfig,
): string | null {
  if (boss.mentionTarget === 'none') return null;
  if (boss.mentionTarget) return boss.mentionTarget;
  return guild.defaultMentionTarget;
}

export function resolveEffectiveLeadMinutes(
  boss: BossRecord,
  guild: GuildConfig,
): number[] {
  const raw = boss.leadMinutes ?? guild.defaultLeadMinutes;
  return Array.from(new Set(raw))
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => b - a);
}

export function computeBossState(
  boss: BossRecord,
  guild: GuildConfig,
  nowMs: number = Date.now(),
): ComputedBossState {
  const effectiveLeadMinutes = resolveEffectiveLeadMinutes(boss, guild);
  const effectiveMentionTarget = resolveEffectiveMention(boss, guild);

  if (!boss.enabled) {
    return {
      boss,
      status: 'disabled',
      nextSpawnAt: null,
      windowEndAt: null,
      occurrenceKey: null,
      isManualOverride: false,
      effectiveLeadMinutes,
      effectiveMentionTarget,
    };
  }

  const graceMs = Math.max(1, guild.spawnGraceMinutes) * 60_000;

  // 1. Check active manual timer override
  if (boss.manualNextAt !== null) {
    const manualStart = boss.manualNextAt;
    const manualEnd = boss.manualNextEndAt;
    const activeCutoff = (manualEnd ?? manualStart) + graceMs;

    // For cooldown bosses, keep manual override slightly longer as 'overdue' unless expired past max overdue
    const expirationCutoff =
      boss.mode === 'cooldown'
        ? (manualEnd ?? manualStart) + Math.max(graceMs, COOLDOWN_OVERDUE_MAX_MS)
        : activeCutoff;

    if (nowMs < expirationCutoff) {
      const status = classifySpawnTiming(
        manualStart,
        manualEnd,
        nowMs,
        graceMs,
        boss.mode === 'cooldown',
      );
      return {
        boss,
        status,
        nextSpawnAt: manualStart,
        windowEndAt: manualEnd,
        occurrenceKey: `manual:${manualStart}`,
        isManualOverride: true,
        effectiveLeadMinutes,
        effectiveMentionTarget,
      };
    }
  }

  // 2. Fixed Schedule mode
  if (boss.mode === 'schedule') {
    const nextSlot = findNextScheduledSpawn(
      boss.scheduleDays ?? [],
      boss.scheduleTimes ?? [],
      guild.timezone,
      nowMs,
      guild.spawnGraceMinutes,
      boss.scheduleIntervalDays,
      boss.scheduleAnchorDate,
    );

    if (nextSlot === null) {
      return {
        boss,
        status: 'untracked',
        nextSpawnAt: null,
        windowEndAt: null,
        occurrenceKey: null,
        isManualOverride: false,
        effectiveLeadMinutes,
        effectiveMentionTarget,
      };
    }

    // If the user already marked this scheduled boss killed around/after this slot opened,
    // advance strictly past this slot so it shows the NEXT scheduled occurrence instead of SPAWNED!
    let effectiveSlot = nextSlot;
    if (boss.lastKilledAt !== null && boss.lastKilledAt >= nextSlot - 5 * 60_000 && nextSlot <= nowMs) {
      const afterSlot = findNextScheduledSpawn(
        boss.scheduleDays ?? [],
        boss.scheduleTimes ?? [],
        guild.timezone,
        nextSlot + graceMs + 1000,
        guild.spawnGraceMinutes,
        boss.scheduleIntervalDays,
        boss.scheduleAnchorDate,
      );
      if (afterSlot !== null) {
        effectiveSlot = afterSlot;
      }
    }

    const status = classifySpawnTiming(effectiveSlot, null, nowMs, graceMs, false);
    return {
      boss,
      status,
      nextSpawnAt: effectiveSlot,
      windowEndAt: null,
      occurrenceKey: `sch:${effectiveSlot}`,
      isManualOverride: false,
      effectiveLeadMinutes,
      effectiveMentionTarget,
    };
  }

  // 3. Cooldown mode
  if (boss.lastKilledAt === null || boss.respawnMinutes === null) {
    return {
      boss,
      status: 'untracked',
      nextSpawnAt: null,
      windowEndAt: null,
      occurrenceKey: null,
      isManualOverride: false,
      effectiveLeadMinutes,
      effectiveMentionTarget,
    };
  }

  const windowStartAt = boss.lastKilledAt + boss.respawnMinutes * 60_000;
  const windowEndAt =
    boss.respawnMaxMinutes !== null && boss.respawnMaxMinutes > boss.respawnMinutes
      ? boss.lastKilledAt + boss.respawnMaxMinutes * 60_000
      : null;

  const endRef = windowEndAt ?? windowStartAt;
  if (nowMs >= endRef + Math.max(graceMs, COOLDOWN_OVERDUE_MAX_MS)) {
    return {
      boss,
      status: 'untracked',
      nextSpawnAt: null,
      windowEndAt: null,
      occurrenceKey: null,
      isManualOverride: false,
      effectiveLeadMinutes,
      effectiveMentionTarget,
    };
  }

  const status = classifySpawnTiming(windowStartAt, windowEndAt, nowMs, graceMs, true);
  return {
    boss,
    status,
    nextSpawnAt: windowStartAt,
    windowEndAt,
    occurrenceKey: `cd:${boss.lastKilledAt}:${windowStartAt}`,
    isManualOverride: false,
    effectiveLeadMinutes,
    effectiveMentionTarget,
  };
}

function classifySpawnTiming(
  startAt: number,
  windowEndAt: number | null,
  nowMs: number,
  graceMs: number,
  allowOverdue: boolean,
): BossStatus {
  if (nowMs < startAt) {
    return startAt - nowMs <= SOON_THRESHOLD_MS ? 'soon' : 'upcoming';
  }

  if (windowEndAt !== null && nowMs <= windowEndAt) {
    return 'window_open';
  }

  const endRef = windowEndAt ?? startAt;
  if (nowMs < endRef + graceMs) {
    return 'spawned';
  }

  return allowOverdue ? 'overdue' : 'spawned';
}

const STATUS_SORT_WEIGHT: Record<BossStatus, number> = {
  window_open: 0,
  spawned: 1,
  overdue: 2,
  soon: 3,
  upcoming: 4,
  untracked: 5,
  disabled: 6,
};

export function sortBossStates(states: ComputedBossState[]): ComputedBossState[] {
  return [...states].sort((a, b) => {
    const weightDiff = STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
    if (weightDiff !== 0) return weightDiff;

    if (a.nextSpawnAt !== null && b.nextSpawnAt !== null) {
      if (a.nextSpawnAt !== b.nextSpawnAt) {
        return a.nextSpawnAt - b.nextSpawnAt;
      }
    } else if (a.nextSpawnAt !== null) {
      return -1;
    } else if (b.nextSpawnAt !== null) {
      return 1;
    }

    return a.boss.name.localeCompare(b.boss.name);
  });
}
