import { Client, SendableChannels } from 'discord.js';
import { BossRepo } from '../db/bossRepo.js';
import { GuildRepo } from '../db/guildRepo.js';
import {
  buildAllowedMentions,
  buildBatchedAlertEmbed,
  formatMentionContent,
} from '../discord/formatters.js';
import { computeBossState } from '../domain/schedule.js';
import { ComputedBossState, GuildConfig } from '../domain/types.js';
import { BoardService, buildAlertComponents } from './boardService.js';

const LEAD_CATCHUP_WINDOW_MS = 120_000;
const SPAWN_CATCHUP_MIN_MS = 180_000;
const ALERT_PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
const ALERT_RETENTION_MS = 30 * 24 * 60 * 60_000;

interface PendingAlert {
  state: ComputedBossState;
  occurrenceKey: string;
  alertType: string;
  includeActionButtons: boolean;
}

export class AlertService {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private lastPrunedAt = 0;

  constructor(
    private readonly client: Client,
    private readonly guildRepo: GuildRepo,
    private readonly bossRepo: BossRepo,
    private readonly boardService: BoardService,
    private readonly intervalSec: number,
  ) {}

  start(): void {
    if (this.timer) return;
    setTimeout(() => {
      void this.tick();
    }, 2000);

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalSec * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.isTicking || !this.client.isReady()) return;
    this.isTicking = true;

    try {
      const now = Date.now();
      const guilds = this.guildRepo.listAll();

      for (const guild of guilds) {
        try {
          await this.processGuild(guild, now);
        } catch (guildError) {
          console.error(
            `[AlertService] Gagal memproses guild ${guild.guildId}:`,
            guildError,
          );
        }
      }

      if (now - this.lastPrunedAt >= ALERT_PRUNE_INTERVAL_MS) {
        this.bossRepo.pruneOldAlerts(ALERT_RETENTION_MS);
        this.lastPrunedAt = now;
      }
    } catch (error) {
      console.error('[AlertService] Error saat tick scheduler:', error);
    } finally {
      this.isTicking = false;
    }
  }

  private async processGuild(guild: GuildConfig, nowMs: number): Promise<void> {
    const bosses = this.bossRepo.listByGuild(guild.guildId, true);
    if (bosses.length === 0) {
      await this.boardService.refreshBoard(guild.guildId, false);
      return;
    }

    let alertSentInGuild = false;

    if (guild.alertChannelId) {
      const channel = await this.resolveAlertChannel(guild.alertChannelId);
      if (channel) {
        const pending: PendingAlert[] = [];
        for (const boss of bosses) {
          const state = computeBossState(boss, guild, nowMs);
          pending.push(...this.collectPendingAlerts(guild, state, nowMs));
        }

        if (pending.length > 0) {
          alertSentInGuild = await this.dispatchGroupedAlerts(
            channel,
            guild,
            pending,
            nowMs,
          );
        }
      }
    }

    await this.boardService.refreshBoard(guild.guildId, alertSentInGuild);
  }

  private async resolveAlertChannel(
    channelId: string,
  ): Promise<SendableChannels | null> {
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch && ch.isTextBased() && ch.isSendable()) {
        return ch;
      }
    } catch (error) {
      console.error(
        `[AlertService] Gagal mengakses alert channel ${channelId}:`,
        error,
      );
    }
    return null;
  }

  private collectPendingAlerts(
    guild: GuildConfig,
    state: ComputedBossState,
    nowMs: number,
  ): PendingAlert[] {
    const { boss, nextSpawnAt, windowEndAt, occurrenceKey } = state;
    if (nextSpawnAt === null || !occurrenceKey) return [];

    const result: PendingAlert[] = [];
    const graceMs = Math.max(1, guild.spawnGraceMinutes) * 60_000;
    const spawnCatchupMs = Math.max(graceMs, SPAWN_CATCHUP_MIN_MS);

    // 1. Lead-time alerts before spawn
    if (nowMs < nextSpawnAt && state.effectiveLeadMinutes.length > 0) {
      const ascendingLeads = [...state.effectiveLeadMinutes].sort((a, b) => a - b);
      for (const leadMin of ascendingLeads) {
        const triggerAt = nextSpawnAt - leadMin * 60_000;
        if (nowMs >= triggerAt && nowMs - triggerAt <= LEAD_CATCHUP_WINDOW_MS) {
          const alertType = `lead_${leadMin}`;
          if (!this.bossRepo.hasAlertBeenSent(boss.id, occurrenceKey, alertType)) {
            result.push({
              state,
              occurrenceKey,
              alertType,
              includeActionButtons: false,
            });
          }
          break;
        }
      }
    }

    // 2. Spawn / window_open alert
    if (nowMs >= nextSpawnAt && nowMs - nextSpawnAt <= spawnCatchupMs) {
      const alertType = 'spawn';
      if (!this.bossRepo.hasAlertBeenSent(boss.id, occurrenceKey, alertType)) {
        result.push({
          state,
          occurrenceKey,
          alertType,
          includeActionButtons: true,
        });
      }
    }

    // 3. Window close alert
    if (
      windowEndAt !== null &&
      nowMs >= windowEndAt &&
      nowMs - windowEndAt <= spawnCatchupMs
    ) {
      const alertType = 'window_close';
      if (!this.bossRepo.hasAlertBeenSent(boss.id, occurrenceKey, alertType)) {
        result.push({
          state,
          occurrenceKey,
          alertType,
          includeActionButtons: true,
        });
      }
    }

    return result;
  }

  private async dispatchGroupedAlerts(
    channel: SendableChannels,
    guild: GuildConfig,
    pending: PendingAlert[],
    nowMs: number,
  ): Promise<boolean> {
    const groups = new Map<string, PendingAlert[]>();

    for (const item of pending) {
      const key = `${item.alertType}|${item.state.nextSpawnAt ?? 'none'}|${item.state.effectiveMentionTarget ?? 'none'}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }

    let sentAny = false;
    for (const items of groups.values()) {
      const first = items[0]!;
      const states = items.map((i) => i.state);
      const mentionTarget = first.state.effectiveMentionTarget;
      const content = formatMentionContent(mentionTarget);
      const embed = buildBatchedAlertEmbed(states, first.alertType, guild);
      const components =
        items.length === 1 && first.includeActionButtons
          ? buildAlertComponents(first.state.boss.id)
          : [];

      try {
        await channel.send({
          content: content || undefined,
          embeds: [embed],
          components,
          allowedMentions: buildAllowedMentions(mentionTarget),
        });

        for (const item of items) {
          this.bossRepo.markAlertSent(
            item.state.boss.id,
            item.occurrenceKey,
            item.alertType,
            nowMs,
          );
        }
        sentAny = true;
      } catch (err) {
        console.error(
          `[AlertService] Gagal kirim alert (${first.alertType}) di guild ${guild.guildId}:`,
          err,
        );
      }
    }

    return sentAny;
  }
}
