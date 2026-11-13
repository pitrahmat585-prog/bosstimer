import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
  computeBossState,
  findNextScheduledSpawn,
  sortBossStates,
} from '../src/domain/schedule.js';
import { BossRecord, GuildConfig } from '../src/domain/types.js';

function makeGuild(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    guildId: 'guild-1',
    timezone: 'Asia/Jakarta',
    alertChannelId: 'chan-1',
    boardChannelId: null,
    boardMessageId: null,
    defaultMentionTarget: 'role-default',
    defaultLeadMinutes: [15, 5, 1],
    spawnGraceMinutes: 5,
    managerRoleId: null,
    updatedAt: 0,
    ...overrides,
  };
}

function makeBoss(overrides: Partial<BossRecord> = {}): BossRecord {
  return {
    id: 1,
    guildId: 'guild-1',
    name: 'Test Boss',
    mode: 'cooldown',
    category: 'World Boss',
    location: null,
    respawnMinutes: 120,
    respawnMaxMinutes: null,
    scheduleDays: null,
    scheduleTimes: null,
    scheduleIntervalDays: null,
    scheduleAnchorDate: null,
    leadMinutes: null,
    mentionTarget: null,
    enabled: true,
    lastKilledAt: null,
    lastKilledBy: null,
    manualNextAt: null,
    manualNextEndAt: null,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('boss scheduling & state computation', () => {
  it('computes cooldown lifecycle across untracked, upcoming, soon, spawned, overdue', () => {
    const guild = makeGuild({ spawnGraceMinutes: 5 });
    const baseKill = 1_700_000_000_000;

    // Never killed -> untracked
    const untracked = computeBossState(makeBoss(), guild, baseKill);
    assert.equal(untracked.status, 'untracked');
    assert.equal(untracked.nextSpawnAt, null);

    const boss = makeBoss({ lastKilledAt: baseKill, respawnMinutes: 60 });
    const expectedSpawn = baseKill + 60 * 60_000;

    // 40m before spawn -> upcoming
    assert.equal(
      computeBossState(boss, guild, expectedSpawn - 40 * 60_000).status,
      'upcoming',
    );

    // 10m before spawn -> soon
    assert.equal(
      computeBossState(boss, guild, expectedSpawn - 10 * 60_000).status,
      'soon',
    );

    // 2m after spawn (within 5m grace) -> spawned
    assert.equal(
      computeBossState(boss, guild, expectedSpawn + 2 * 60_000).status,
      'spawned',
    );

    // 15m after spawn (past grace, < 2h) -> overdue
    assert.equal(
      computeBossState(boss, guild, expectedSpawn + 15 * 60_000).status,
      'overdue',
    );

    // 3h after spawn -> falls back to untracked
    assert.equal(
      computeBossState(boss, guild, expectedSpawn + 180 * 60_000).status,
      'untracked',
    );
  });

  it('handles min-max random spawn windows', () => {
    const guild = makeGuild({ spawnGraceMinutes: 5 });
    const killAt = 1_700_000_000_000;
    const boss = makeBoss({
      lastKilledAt: killAt,
      respawnMinutes: 120,
      respawnMaxMinutes: 150,
    });

    const minAt = killAt + 120 * 60_000;
    const maxAt = killAt + 150 * 60_000;

    const insideWindow = computeBossState(boss, guild, minAt + 10 * 60_000);
    assert.equal(insideWindow.status, 'window_open');
    assert.equal(insideWindow.nextSpawnAt, minAt);
    assert.equal(insideWindow.windowEndAt, maxAt);

    const afterWindow = computeBossState(boss, guild, maxAt + 2 * 60_000);
    assert.equal(afterWindow.status, 'spawned');
  });

  it('finds next scheduled slot in guild timezone and rolls forward after grace', () => {
    const guild = makeGuild({ timezone: 'Asia/Jakarta', spawnGraceMinutes: 5 });
    // Saturday 2026-11-14 19:45 WIB
    const beforeSlot = DateTime.fromObject(
      { year: 2026, month: 11, day: 14, hour: 19, minute: 45, second: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();

    // Wednesdays (3) & Saturdays (6) at 20:00
    const slotToday = findNextScheduledSpawn(
      [3, 6],
      ['20:00'],
      'Asia/Jakarta',
      beforeSlot,
      5,
    );
    const expectedToday = DateTime.fromObject(
      { year: 2026, month: 11, day: 14, hour: 20, minute: 0, second: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    assert.equal(slotToday, expectedToday);

    // 3m after 20:00 -> still active within 5m grace -> status 'spawned'
    const boss = makeBoss({
      mode: 'schedule',
      respawnMinutes: null,
      scheduleDays: [3, 6],
      scheduleTimes: ['20:00'],
    });
    const duringGrace = computeBossState(boss, guild, expectedToday + 3 * 60_000);
    assert.equal(duringGrace.status, 'spawned');
    assert.equal(duringGrace.nextSpawnAt, expectedToday);

    // If user marks it killed during grace, advances to next Wednesday 2026-11-18 20:00
    const killedDuringSpawn = computeBossState(
      { ...boss, lastKilledAt: expectedToday + 2 * 60_000 },
      guild,
      expectedToday + 3 * 60_000,
    );
    const expectedWed = DateTime.fromObject(
      { year: 2026, month: 11, day: 18, hour: 20, minute: 0, second: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    assert.equal(killedDuringSpawn.status, 'upcoming');
    assert.equal(killedDuringSpawn.nextSpawnAt, expectedWed);

    // 6m after 20:00 (past grace) without kill -> also rolls to Wednesday
    const afterGrace = computeBossState(boss, guild, expectedToday + 6 * 60_000);
    assert.equal(afterGrace.nextSpawnAt, expectedWed);
  });

  it('supports manual timer override and mention/lead inheritance', () => {
    const guild = makeGuild({
      defaultMentionTarget: 'everyone',
      defaultLeadMinutes: [15, 5],
    });
    const now = 1_700_000_000_000;
    const boss = makeBoss({
      manualNextAt: now + 10 * 60_000,
      mentionTarget: 'none',
      leadMinutes: [30, 10],
    });

    const state = computeBossState(boss, guild, now);
    assert.equal(state.isManualOverride, true);
    assert.equal(state.status, 'soon');
    assert.equal(state.effectiveMentionTarget, null);
    assert.deepEqual(state.effectiveLeadMinutes, [30, 10]);
  });

  it('sorts states by urgency then spawn time', () => {
    const guild = makeGuild();
    const now = 1_700_000_000_000;

    const states = [
      computeBossState(makeBoss({ id: 1, name: 'Untracked' }), guild, now),
      computeBossState(
        makeBoss({ id: 2, name: 'Later', lastKilledAt: now, respawnMinutes: 120 }),
        guild,
        now,
      ),
      computeBossState(
        makeBoss({ id: 3, name: 'Soon', lastKilledAt: now - 50 * 60_000, respawnMinutes: 60 }),
        guild,
        now,
      ),
      computeBossState(
        makeBoss({ id: 4, name: 'Live', lastKilledAt: now - 61 * 60_000, respawnMinutes: 60 }),
        guild,
        now,
      ),
    ];

    const sorted = sortBossStates(states).map((s) => s.boss.name);
    assert.deepEqual(sorted, ['Live', 'Soon', 'Later', 'Untracked']);
  });

  it('computes every-other-day (2-day interval) schedule accurately', () => {
    const guild = makeGuild({ timezone: 'Asia/Jakarta', spawnGraceMinutes: 5 });
    const boss = makeBoss({
      mode: 'schedule',
      respawnMinutes: null,
      scheduleDays: null,
      scheduleTimes: ['20:00'],
      scheduleIntervalDays: 2,
      scheduleAnchorDate: '2026-11-15',
    });

    // Saturday 2026-11-14 00:26 WIB -> next spawn Sunday 2026-11-15 20:00 WIB (1d 19h 34m left)
    const satMorning = DateTime.fromObject(
      { year: 2026, month: 11, day: 14, hour: 0, minute: 26 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    const expectedSun = DateTime.fromObject(
      { year: 2026, month: 11, day: 15, hour: 20, minute: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    assert.equal(computeBossState(boss, guild, satMorning).nextSpawnAt, expectedSun);

    // Monday 2026-11-16 00:26 WIB -> next spawn Tuesday 2026-11-17 20:00 WIB
    const monMorning = DateTime.fromObject(
      { year: 2026, month: 11, day: 16, hour: 0, minute: 26 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    const expectedTue = DateTime.fromObject(
      { year: 2026, month: 11, day: 17, hour: 20, minute: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();
    assert.equal(computeBossState(boss, guild, monMorning).nextSpawnAt, expectedTue);
  });
});
