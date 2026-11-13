import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  DiscordAPIError,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextBasedChannel,
} from 'discord.js';
import { GuildRepo } from '../db/guildRepo.js';
import {
  formatBossRuleSummary,
  formatBoardLine,
  getStatusEmoji,
} from '../discord/formatters.js';
import { ComputedBossState, GuildConfig } from '../domain/types.js';
import { BossService } from './bossService.js';

export const BOARD_CUSTOM_IDS = {
  QUICK_KILL_SELECT: 'board:quick_kill',
  KILL_MODAL_BTN: 'board:kill_modal',
  ALL_BOSSES_BTN: 'board:all_bosses',
  REFRESH_BTN: 'board:refresh',
} as const;

export function buildAlertComponents(
  bossId: number,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`alert:kill:${bossId}`)
      .setLabel('Tandai Mati Sekarang')
      .setEmoji('💀')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`alert:reset:${bossId}`)
      .setLabel('Reset Timer')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

interface BoardTracker {
  signature: string;
  lastRefreshedAt: number;
}

export class BoardService {
  private readonly trackers = new Map<string, BoardTracker>();

  constructor(
    private readonly client: Client,
    private readonly guildRepo: GuildRepo,
    private readonly bossService: BossService,
    private readonly boardRefreshSec: number,
  ) {}

  buildBoardPayload(
    guildId: string,
    nowMs: number = Date.now(),
  ): {
    guild: GuildConfig;
    states: ComputedBossState[];
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
    signature: string;
  } {
    const { guild, states } = this.bossService.getGuildBossStates(guildId, nowMs);
    const enabledStates = states.filter((s) => s.status !== 'disabled');

    const counts = {
      live: 0,
      soon: 0,
      upcoming: 0,
      untracked: 0,
    };

    for (const s of enabledStates) {
      if (s.status === 'window_open' || s.status === 'spawned' || s.status === 'overdue') {
        counts.live++;
      } else if (s.status === 'soon') {
        counts.soon++;
      } else if (s.status === 'upcoming') {
        counts.upcoming++;
      } else if (s.status === 'untracked') {
        counts.untracked++;
      }
    }

    const alertText = guild.alertChannelId
      ? `<#${guild.alertChannelId}>`
      : '*Belum diatur (`/config channels`)*';

    const header =
      `🕒 Zona Waktu: **${guild.timezone}** | 🔔 Alert: ${alertText}\n` +
      `📊 Ringkasan: 🔴 Live **${counts.live}** • ⚡ Segera **${counts.soon}** • 🟢 Terjadwal **${counts.upcoming}** • ⚪ Menunggu **${counts.untracked}**`;

    const lines: string[] = [];
    let charCount = header.length + 2;
    let hiddenCount = 0;
    const maxDisplay = 22;

    if (enabledStates.length === 0) {
      lines.push(
        '\n*Belum ada boss aktif.*\nGunakan `/boss add-cooldown`, `/boss add-schedule`, atau `/boss seed` untuk mengisi daftar boss!',
      );
    } else {
      lines.push('');
      for (let i = 0; i < enabledStates.length; i++) {
        const st = enabledStates[i]!;
        if (i >= maxDisplay) {
          hiddenCount++;
          continue;
        }
        const line = formatBoardLine(st, guild.timezone);
        if (charCount + line.length + 120 > 3950) {
          hiddenCount++;
          continue;
        }
        lines.push(line);
        charCount += line.length + 2;
      }
    }

    if (hiddenCount > 0) {
      lines.push(
        `\n*...dan ${hiddenCount} boss lainnya. Klik **📜 Semua Boss** atau ketik \`/bosses\`.*`,
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ LIVE BOSS TIMER BOARD')
      .setColor(counts.live > 0 ? 0xed4245 : counts.soon > 0 ? 0xf1c40f : 0x5865f2)
      .setDescription(`${header}\n${lines.join('\n')}`)
      .setFooter({
        text: 'Klik Quick Kill di bawah untuk lapor boss mati instan • Auto-update aktif',
      })
      .setTimestamp(new Date(nowMs));

    const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

    if (enabledStates.length > 0) {
      const selectOptions = enabledStates.slice(0, 25).map((st) => {
        const summary = formatBossRuleSummary(st.boss, guild.timezone);
        const loc = st.boss.location ? ` • ${st.boss.location}` : '';
        const desc = `${st.boss.category}${loc} • ${summary}`.slice(0, 100);
        return new StringSelectMenuOptionBuilder()
          .setLabel(st.boss.name.slice(0, 100))
          .setValue(String(st.boss.id))
          .setEmoji(getStatusEmoji(st.status))
          .setDescription(desc);
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(BOARD_CUSTOM_IDS.QUICK_KILL_SELECT)
        .setPlaceholder('💀 Quick Kill — Pilih boss yang baru saja mati...')
        .addOptions(selectOptions);

      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
      );
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(BOARD_CUSTOM_IDS.KILL_MODAL_BTN)
        .setLabel('Catat Kill (Custom)')
        .setEmoji('💀')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(enabledStates.length === 0),
      new ButtonBuilder()
        .setCustomId(BOARD_CUSTOM_IDS.ALL_BOSSES_BTN)
        .setLabel('Semua Boss')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(BOARD_CUSTOM_IDS.REFRESH_BTN)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary),
    );
    components.push(buttonRow);

    const signature = JSON.stringify({
      tz: guild.timezone,
      ac: guild.alertChannelId,
      items: enabledStates.map((s) => [
        s.boss.id,
        s.boss.name,
        s.status,
        s.nextSpawnAt,
        s.windowEndAt,
        s.isManualOverride,
      ]),
    });

    return { guild, states, embeds: [embed], components, signature };
  }

  async setupBoard(
    guildId: string,
    channel: TextBasedChannel & { id: string; send: Function },
  ): Promise<string> {
    const prevGuild = this.guildRepo.getOrCreate(guildId);
    if (prevGuild.boardChannelId && prevGuild.boardMessageId) {
      await this.tryDeleteOldBoard(
        prevGuild.boardChannelId,
        prevGuild.boardMessageId,
      );
    }

    const payload = this.buildBoardPayload(guildId);
    const msg = await channel.send({
      embeds: payload.embeds,
      components: payload.components,
    });

    this.guildRepo.update(guildId, {
      boardChannelId: channel.id,
      boardMessageId: msg.id,
    });

    this.trackers.set(guildId, {
      signature: payload.signature,
      lastRefreshedAt: Date.now(),
    });

    return msg.id;
  }

  async removeBoard(guildId: string): Promise<boolean> {
    const guild = this.guildRepo.getOrCreate(guildId);
    const hadBoard = Boolean(guild.boardChannelId && guild.boardMessageId);

    if (guild.boardChannelId && guild.boardMessageId) {
      await this.tryDeleteOldBoard(guild.boardChannelId, guild.boardMessageId);
    }

    this.guildRepo.update(guildId, {
      boardChannelId: null,
      boardMessageId: null,
    });
    this.trackers.delete(guildId);
    return hadBoard;
  }

  async refreshBoard(guildId: string, force = false): Promise<boolean> {
    const guild = this.guildRepo.getOrCreate(guildId);
    if (!guild.boardChannelId || !guild.boardMessageId) {
      return false;
    }

    const now = Date.now();
    const payload = this.buildBoardPayload(guildId, now);
    const prev = this.trackers.get(guildId);

    if (!force && prev) {
      const unchanged = prev.signature === payload.signature;
      const withinInterval =
        now - prev.lastRefreshedAt < this.boardRefreshSec * 1000;
      if (unchanged && withinInterval) {
        return false;
      }
    }

    try {
      const channel = await this.client.channels.fetch(guild.boardChannelId);
      if (!channel || !channel.isTextBased()) {
        this.guildRepo.update(guildId, {
          boardChannelId: null,
          boardMessageId: null,
        });
        return false;
      }

      const msg = await channel.messages.fetch(guild.boardMessageId);
      await msg.edit({
        embeds: payload.embeds,
        components: payload.components,
      });

      this.trackers.set(guildId, {
        signature: payload.signature,
        lastRefreshedAt: now,
      });
      return true;
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        // 10008 = Unknown Message, 10003 = Unknown Channel
        if (error.code === 10008) {
          this.guildRepo.update(guildId, { boardMessageId: null });
        } else if (error.code === 10003) {
          this.guildRepo.update(guildId, {
            boardChannelId: null,
            boardMessageId: null,
          });
        }
      }
      console.error(
        `[BoardService] Gagal refresh board guild ${guildId}:`,
        error,
      );
      return false;
    }
  }

  private async tryDeleteOldBoard(
    channelId: string,
    messageId: string,
  ): Promise<void> {
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch && ch.isTextBased()) {
        const msg = await ch.messages.fetch(messageId);
        await msg.delete();
      }
    } catch {
      // Ignore if message/channel already deleted or inaccessible
    }
  }
}
