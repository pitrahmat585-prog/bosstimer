import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client, GatewayIntentBits } from 'discord.js';
import { createDatabase } from '../src/db/database.js';
import { BossRepo } from '../src/db/bossRepo.js';
import { GuildRepo } from '../src/db/guildRepo.js';
import { AlertService } from '../src/services/alertService.js';
import { BoardService } from '../src/services/boardService.js';
import { BossService } from '../src/services/bossService.js';

describe('BoardService & AlertService', () => {
  it('builds board payload safely for 0 bosses and >25 bosses', () => {
    const db = createDatabase(':memory:');
    try {
      const guildRepo = new GuildRepo(db);
      const bossRepo = new BossRepo(db);
      const bossService = new BossService(guildRepo, bossRepo);
      const client = new Client({ intents: [GatewayIntentBits.Guilds] });
      const boardService = new BoardService(client, guildRepo, bossService, 60);

      // 0 bosses: button row only, kill modal disabled
      const emptyPayload = boardService.buildBoardPayload('g-empty');
      assert.equal(emptyPayload.embeds.length, 1);
      assert.equal(emptyPayload.components.length, 1);

      // 30 bosses: select menu capped at 25 options, embed handles >22 cleanly
      for (let i = 1; i <= 30; i++) {
        bossRepo.create({
          guildId: 'g-many',
          name: `Boss ${String(i).padStart(2, '0')}`,
          mode: 'cooldown',
          respawnMinutes: 60,
        });
      }
      const manyPayload = boardService.buildBoardPayload('g-many');
      assert.equal(manyPayload.embeds.length, 1);
      assert.equal(manyPayload.components.length, 2);
      const embedJson = manyPayload.embeds[0]!.toJSON();
      assert.ok((embedJson.description?.length ?? 0) <= 4096);
      assert.match(embedJson.description ?? '', /dan 8 boss lainnya/);
    } finally {
      db.close();
    }
  });

  it('dispatches lead, spawn, and window_close alerts once per occurrence', async () => {
    const db = createDatabase(':memory:');
    try {
      const guildRepo = new GuildRepo(db);
      const bossRepo = new BossRepo(db);
      const bossService = new BossService(guildRepo, bossRepo);

      guildRepo.update('g-alert', {
        alertChannelId: 'chan-alert',
        defaultLeadMinutes: [15, 5],
        defaultMentionTarget: 'role-123',
        spawnGraceMinutes: 5,
      });

      const now = Date.now();
      const boss = bossRepo.create({
        guildId: 'g-alert',
        name: 'Window Dragon',
        mode: 'cooldown',
        respawnMinutes: 60,
        respawnMaxMinutes: 90,
      });

      const sentMessages: Array<{ content?: string; title?: string; hasComponents: boolean }> = [];
      const fakeChannel = {
        id: 'chan-alert',
        isTextBased: () => true,
        isSendable: () => true,
        send: async (msg: {
          content?: string;
          embeds?: Array<{ toJSON(): { title?: string } }>;
          components?: unknown[];
        }) => {
          sentMessages.push({
            content: msg.content,
            title: msg.embeds?.[0]?.toJSON().title,
            hasComponents: (msg.components?.length ?? 0) > 0,
          });
          return { id: `msg-${sentMessages.length}` };
        },
      };

      const fakeClient = {
        isReady: () => true,
        channels: {
          fetch: async (id: string) => (id === 'chan-alert' ? fakeChannel : null),
        },
      } as unknown as Client;

      const boardService = new BoardService(fakeClient, guildRepo, bossService, 60);
      const alertService = new AlertService(
        fakeClient,
        guildRepo,
        bossRepo,
        boardService,
        10,
      );

      // Kill boss 55m30s ago -> 4m30s until min window (inside 5m lead window, missed 15m)
      bossRepo.recordKill({
        bossId: boss.id,
        guildId: 'g-alert',
        killedAt: now - (55 * 60_000 + 30_000),
        reportedBy: 'u1',
        source: 'slash',
      });

      await alertService.tick();
      // Second immediate tick must NOT duplicate lead_5
      await alertService.tick();

      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0]?.content, '<@&role-123>');
      assert.match(sentMessages[0]?.title ?? '', /5 MENIT LAGI/);
      assert.equal(sentMessages[0]?.hasComponents, false);

      // Advance by killing 60m30s ago (wait: keep same killedAt logic by shifting kill earlier? No, same occurrence!)
      // Instead test spawn & window_close using manual timers at exact offsets relative to Date.now()
      const spawnBoss = bossRepo.create({
        guildId: 'g-alert',
        name: 'Exact Boss',
        mode: 'cooldown',
        respawnMinutes: 60,
        respawnMaxMinutes: 70,
      });
      // Set manual timer where window already opened 10s ago and closes in 5m
      bossRepo.setManualTimer({
        bossId: spawnBoss.id,
        guildId: 'g-alert',
        nextAt: Date.now() - 10_000,
        nextEndAt: Date.now() + 5 * 60_000,
        reportedBy: 'u1',
      });

      await alertService.tick();
      await alertService.tick();

      assert.equal(sentMessages.length, 2);
      assert.match(sentMessages[1]?.title ?? '', /WINDOW RESPAWN DIBUKA: Exact Boss/);
      assert.equal(sentMessages[1]?.hasComponents, true);
    } finally {
      db.close();
    }
  });

  it('batches simultaneous alerts for multiple bosses into one Discord message', async () => {
    const db = createDatabase(':memory:');
    try {
      const guildRepo = new GuildRepo(db);
      const bossRepo = new BossRepo(db);
      const bossService = new BossService(guildRepo, bossRepo);

      guildRepo.update('g-batch', {
        alertChannelId: 'chan-batch',
        defaultLeadMinutes: [15],
        defaultMentionTarget: 'everyone',
        spawnGraceMinutes: 5,
      });

      const sentMessages: Array<{ content?: string; title?: string; desc?: string }> = [];
      const fakeChannel = {
        id: 'chan-batch',
        isTextBased: () => true,
        isSendable: () => true,
        send: async (msg: {
          content?: string;
          embeds?: Array<{ toJSON(): { title?: string; description?: string } }>;
        }) => {
          const json = msg.embeds?.[0]?.toJSON();
          sentMessages.push({
            content: msg.content,
            title: json?.title,
            desc: json?.description,
          });
          return { id: `msg-${sentMessages.length}` };
        },
      };

      const fakeClient = {
        isReady: () => true,
        channels: {
          fetch: async (id: string) => (id === 'chan-batch' ? fakeChannel : null),
        },
      } as unknown as Client;

      const boardService = new BoardService(fakeClient, guildRepo, bossService, 60);
      const alertService = new AlertService(
        fakeClient,
        guildRepo,
        bossRepo,
        boardService,
        10,
      );

      bossService.seedStarterBosses('g-batch', 'architect_g1_all');
      const bosses = bossRepo.listByGuild('g-batch', true);
      assert.equal(bosses.length, 3);

      // Give all 3 bosses the exact same next spawn 14m30s from now
      const sharedSpawn = Date.now() + 14 * 60_000 + 30_000;
      for (const b of bosses) {
        bossRepo.setManualTimer({
          bossId: b.id,
          guildId: 'g-batch',
          nextAt: sharedSpawn,
          reportedBy: 'u1',
        });
      }

      await alertService.tick();
      await alertService.tick();

      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0]?.content, '@everyone');
      assert.match(sentMessages[0]?.title ?? '', /15 MENIT LAGI.*3 Boss/);
      assert.match(sentMessages[0]?.desc ?? '', /Black Reaper Karugura/);
      assert.match(sentMessages[0]?.desc ?? '', /Infected Beast King Gigas/);
    } finally {
      db.close();
    }
  });
});
