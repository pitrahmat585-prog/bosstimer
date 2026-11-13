import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/database.js';
import { BossRepo } from '../src/db/bossRepo.js';
import { GuildRepo } from '../src/db/guildRepo.js';
import { BossService } from '../src/services/bossService.js';

describe('SQLite repositories & BossService', () => {
  it('handles guild config, boss CRUD, kill logs, alert deduplication, and import/export', () => {
    const db = createDatabase(':memory:');
    try {
      const guildRepo = new GuildRepo(db);
      const bossRepo = new BossRepo(db);
      const bossService = new BossService(guildRepo, bossRepo);

      const guild = guildRepo.getOrCreate('g-100');
      assert.equal(guild.timezone, 'Asia/Jakarta');
      assert.deepEqual(guild.defaultLeadMinutes, [15, 5, 1]);

      // Seed starter bosses
      const seedRes = bossService.seedStarterBosses('g-100');
      assert.equal(seedRes.added.length, 4);
      assert.equal(seedRes.skipped.length, 0);

      // Re-seeding skips existing
      const secondSeed = bossService.seedStarterBosses('g-100');
      assert.equal(secondSeed.added.length, 0);
      assert.equal(secondSeed.skipped.length, 4);

      // Seed Architect Field Boss Group I (08:15, 11:15, 20:15, 23:15 WIB) & SGT (UTC+8)
      const archSingle = bossService.seedStarterBosses('g-arch-wib', 'architect_g1_single');
      assert.deepEqual(archSingle.added, ['Field Boss Group I']);
      const fbGroup1 = bossRepo.getByName('g-arch-wib', 'Field Boss Group I');
      assert.ok(fbGroup1);
      assert.deepEqual(fbGroup1.scheduleTimes, ['08:15', '11:15', '20:15', '23:15']);

      guildRepo.update('g-arch-sgt', { timezone: 'Asia/Singapore' });
      const archG1All = bossService.seedStarterBosses('g-arch-sgt', 'architect_g1_all');
      assert.deepEqual(archG1All.added, [
        'Black Reaper Karugura',
        'Red Mane Tagar',
        'Infected Beast King Gigas',
      ]);
      const karugura = bossRepo.getByName('g-arch-sgt', 'Black Reaper Karugura');
      assert.deepEqual(karugura?.scheduleTimes, ['00:15', '09:15', '12:15', '21:15']);

      // Seed full Architect suite (Group I + World Boss + Giant's Tower 1F-3F)
      const archAll = bossService.seedStarterBosses('g-arch-full', 'architect_all');
      assert.equal(archAll.added.length, 7);
      const behemoth = bossRepo.getByName('g-arch-full', 'Ancient Monster Behemoth');
      assert.equal(behemoth?.scheduleIntervalDays, 2);
      assert.equal(behemoth?.scheduleAnchorDate, '2026-11-15');

      // Case-insensitive lookup & manual override cleared by kill
      const crimson = bossRepo.getByName('g-100', 'crimson dragon');
      assert.ok(crimson);

      const manualAt = Date.now() + 30 * 60_000;
      bossService.setManualTimer({
        guildId: 'g-100',
        bossId: crimson.id,
        nextAt: manualAt,
        reportedBy: 'user-1',
      });
      assert.equal(bossRepo.getById(crimson.id)?.manualNextAt, manualAt);

      const killRes = bossService.recordKill({
        guildId: 'g-100',
        bossId: crimson.id,
        killedAt: Date.now(),
        reportedBy: 'user-2',
        source: 'slash',
        note: 'Ch.1',
      });
      assert.ok(killRes);
      assert.equal(killRes.state.isManualOverride, false);
      assert.equal(killRes.state.boss.manualNextAt, null);

      const logs = bossRepo.listKillLogs(crimson.id, 10);
      assert.equal(logs.length, 2);
      assert.equal(logs[0]?.source, 'slash');
      assert.equal(logs[0]?.note, 'Ch.1');

      // Alert deduplication
      assert.equal(bossRepo.hasAlertBeenSent(crimson.id, 'cd:1', 'lead_5'), false);
      bossRepo.markAlertSent(crimson.id, 'cd:1', 'lead_5');
      bossRepo.markAlertSent(crimson.id, 'cd:1', 'lead_5');
      assert.equal(bossRepo.hasAlertBeenSent(crimson.id, 'cd:1', 'lead_5'), true);

      // Export & import into another guild
      const exported = JSON.stringify(bossService.exportBosses('g-100'));
      const importRes = bossService.importBosses('g-200', exported, false);
      assert.equal(importRes.created, 4);
      assert.equal(importRes.errors.length, 0);

      // Rejects invalid JSON cleanly
      assert.throws(
        () => bossService.importBosses('g-200', '{bad json', false),
        /tidak valid/i,
      );
    } finally {
      db.close();
    }
  });
});
